const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./db');

const app = express();
// Force redeploy - Update sequence 2026-04-20
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Serve static files from the 'public' directory
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Explicit routes for Vercel
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(publicPath, 'dashboard.html')));

// ==== MIDDLEWARES & HELPERS ====

// Middleware de Autenticação
async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        console.error("ERRO AUTH.GETUSER:", error);
        return res.status(401).json({ error: 'Token inválido', detalhes: error });
    }

    // Buscar perfil do usuário para pegar o Role
    const { data: perfil, error: perfilError } = await supabase
        .from('perfis')
        .select('role')
        .eq('id', user.id)
        .single();

    if (perfilError) {
        console.error(`Erro ao buscar perfil para user ${user.id}:`, perfilError.message);
    }

    // Se não encontrar perfil, assume 'visualizador'
    const role = (perfil && !perfilError) ? perfil.role : 'visualizador';
    
    console.log(`Usuário autenticado: ${user.email} | Cargo: ${role}`);

    req.user = { ...user, role };
    next();
}

// Middleware para restringir por Role
function restrictTo(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Você não tem permissão para realizar esta ação' });
        }
        next();
    };
}

// Função para log de auditoria
async function logAudit(userId, email, acao, tabela, itemId, antigo, novo) {
    try {
        await supabase.from('logs_auditoria').insert([{
            user_id: userId,
            user_email: email,
            acao,
            tabela_alvo: tabela,
            item_id: String(itemId),
            dados_antigos: antigo,
            dados_novos: novo
        }]);
    } catch (err) {
        console.error('Erro ao gravar log de auditoria:', err);
    }
}

// ==== API ROUTES ====

// Debug Privado (Será removido em breve)
app.get('/api/debug-env', (req, res) => {
    res.json({
        has_url: !!process.env.SUPABASE_URL,
        has_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        has_service_key: !!process.env.SUPABASE_SERVICE_KEY,
        has_supabase_key: !!process.env.SUPABASE_KEY,
        key_str_length: process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.length : 0
    });
});

// Aplicar autenticação em todas as rotas de API
app.use('/api', authenticateUser);

// Rota de Perfil (Utilitário para o Frontend)
app.get('/api/me', (req, res) => {
    res.json({ email: req.user.email, role: req.user.role });
});

// -- Equipamentos --
app.get('/api/equipamentos', async (req, res) => {
    const { data, error } = await supabase
        .from('equipamentos')
        .select(`
            *, 
            tecnicos!tecnico_id(nome),
            tecnicos_anterior:tecnicos!id_tecnico_anterior(nome)
        `)
        .is('deleted_at', null);
        
    if (error) return res.status(500).json({ error: error.message });
    
    // Map tecnicos(nome) to tecnico_nome to maintain API compatibility
    const rows = data.map(eq => ({
        ...eq,
        tecnico_nome: eq.tecnicos ? eq.tecnicos.nome : null,
        tecnico_anterior_nome: eq.tecnicos_anterior ? eq.tecnicos_anterior.nome : null
    }));
    
    res.json(rows);
});

app.post('/api/equipamentos', restrictTo('master', 'gerente', 'operador'), async (req, res) => {
    const { num_interno, serial, status, tecnico_id, modelo } = req.body;
    
    const { data, error } = await supabase
        .from('equipamentos')
        .insert([{
            num_interno, 
            serial, 
            status: status || 'Disponível', 
            tecnico_id: tecnico_id || null, 
            modelo: modelo || null
        }])
        .select();
        
    if (error) return res.status(500).json({ error: error.message });

    if (data && data.length > 0) {
        logAudit(req.user.id, req.user.email, 'CADASTRAR', 'equipamentos', data[0].id, null, data[0]);
        // Registrar no histórico
        await supabase.from('historico_movimentacoes').insert([{
            equipamento_id: data[0].id,
            tipo: 'CADASTRADO',
            user_email: req.user.email,
            observacao: 'Equipamento inserido no sistema'
        }]);
    }

    if (!data || data.length === 0) return res.json({ success: true, message: "Equipamento adicionado (sem retorno de ID)" });
    res.json({ success: true, id: data[0].id });
});

app.post('/api/equipamentos/bulk', restrictTo('master', 'gerente'), async (req, res) => {
    const equipamentos = req.body; 
    
    const payloads = equipamentos.map(eq => ({
        num_interno: eq.num_interno,
        serial: eq.serial,
        status: 'Disponível',
        modelo: eq.modelo || null
    }));
    
    const { data, error } = await supabase
        .from('equipamentos')
        .upsert(payloads, { onConflict: 'num_interno', ignoreDuplicates: false })
        .select();
        
    if (error) return res.status(500).json({ error: error.message });
    
    logAudit(req.user.id, req.user.email, 'CADASTRAR_LOTE', 'equipamentos', 'múltiplos', null, { count: equipamentos.length });
    
    // Registrar no histórico em lote
    if (data && data.length > 0) {
        const histPayloads = data.map(eq => ({
            equipamento_id: eq.id,
            tipo: 'CADASTRADO',
            user_email: req.user.email,
            observacao: 'Equipamento inserido via Lote Excel'
        }));
        await supabase.from('historico_movimentacoes').insert(histPayloads);
    }
    
    res.json({ success: true, count: equipamentos.length });
});

// Update Equipment
app.put('/api/equipamentos/:id', restrictTo('master', 'gerente'), async (req, res) => {
    const { id } = req.params;
    const { num_interno, serial, modelo, status } = req.body;
    if (status === 'Disponível') return res.status(403).json({ error: "Bypass Bloqueado: Transição para Disponível deve ocorrer via Tratamento." });

    // Buscar dados antigos para o log
    const { data: antigo } = await supabase.from('equipamentos').select('*').eq('id', id).is('deleted_at', null).single();

    const { data, error } = await supabase
        .from('equipamentos')
        .update({ num_interno, serial, modelo })
        .eq('id', id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    
    if (data && data.length > 0) {
        logAudit(req.user.id, req.user.email, 'EDITAR', 'equipamentos', id, antigo, data[0]);
    }

    res.json({ success: true, data: data[0] });
});

// Delete Equipment -> Agora via RPC Transacional
app.delete('/api/equipamentos/:id', restrictTo('master'), async (req, res) => {
    const { id } = req.params;

    // Apenas checar se existe primeiro para fail-fast
    const { data: antigo } = await supabase.from('equipamentos').select('id').eq('id', id).is('deleted_at', null).single();
    if (!antigo) return res.status(404).json({ error: "Equipamento não encontrado ou já deletado." });

    // Roda RPC Transacional de deleção e histórico atômico
    const { error } = await supabase.rpc('soft_delete_equipamento', { req_id: parseInt(id), usr_email: req.user.email });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Equipamento perfeitamente enviado à lixeira.' });
});

// Restaurar Equipment -> Nova Rota RPC Transacional
app.put('/api/equipamentos/:id/restaurar', restrictTo('master', 'gerente'), async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase.rpc('restore_equipamento', { req_id: parseInt(id), usr_email: req.user.email });

    if (error) {
        if (error.message.includes('Já existe um equipamento ativo')) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
    
    res.json({ success: true, message: 'Equipamento Restaurado!' });
});

// Bulk assign to technician (Legacy for excel upload)
app.post('/api/equipamentos/assign', restrictTo('master', 'gerente', 'operador'), async (req, res) => {
    const { ids, tecnico_id } = req.body;
    if (!ids || !ids.length || !tecnico_id) return res.status(400).json({ error: "Missing data" });

    const today = new Date().toISOString();
    
    const { data, error } = await supabase
        .from('equipamentos')
        .update({ status: 'Em Estoque Técnico', tecnico_id, data_distribuicao: today })
        .in('id', ids)
        .is('deleted_at', null);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, changes: ids.length });
});

// Dynamic Movement for Individual Assignment (Assign, Transfer, Devolve)
app.post('/api/equipamentos/move', restrictTo('master', 'gerente', 'operador'), async (req, res) => {
    const { ids, action, tecnico_id } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: "Missing ids" });

    // Buscar dados antigos para o log
    const { data: antigos } = await supabase.from('equipamentos').select('*').in('id', ids).is('deleted_at', null);

    let updatePayload = {};
    if (action === 'devolve') {
        for (const eq_id of ids) {
             const {error} = await supabase.rpc('fluxo_registrar_devolucao', { req_id: parseInt(eq_id), usr_email: req.user.email, placa_info: null, origem_info: 'movimentacao_manual' });
             if (error) return res.status(500).json({ error: error.message });
        }
        return res.json({ success: true, changes: ids.length });
    } else if (action === 'assign' || action === 'transfer') {
        if (!tecnico_id) return res.status(400).json({ error: "Missing Target Technician ID" });
        updatePayload = { status: 'Em Estoque Técnico', tecnico_id, data_distribuicao: new Date().toISOString() };
    } else {
        return res.status(400).json({ error: "Invalid action" });
    }
    
    const { data, error } = await supabase
        .from('equipamentos')
        .update(updatePayload)
        .in('id', ids)
        .is('deleted_at', null)
        .select();
        
    if (error) return res.status(500).json({ error: error.message });

    logAudit(req.user.id, req.user.email, 'MOVIMENTAR', 'equipamentos', ids.join(','), antigos, data);

    res.json({ success: true, changes: ids.length });
});



// Dashboard Especializado de Devolucoes (Analytics)
app.get('/api/stats/devolucoes', async (req, res) => {
    try {
        const { data: historico, error } = await supabase
            .from('historico_movimentacoes')
            .select('equipamento_id, tipo, tecnico_id, equipamentos(serial, modelo), tecnicos(nome)')
            .in('tipo', ['DEVOLUCAO', 'TRATAMENTO', 'equipamento_devolvido', 'tratamento_concluido']);
            
        if (error) return res.status(500).json({ error: error.message });

        let totalDevolucoes = 0;
        let totalTratamentos = 0;
        const countEquips = {}; // { equipId: { serial, count } }
        const countTechs = {}; // { techId: { nome, count } }

        historico.forEach(log => {
            if (log.tipo === 'equipamento_devolvido' || log.tipo === 'DEVOLUCAO') {
                totalDevolucoes++;
                
                // Agrupar Equipamentos
                const eId = log.equipamento_id;
                if (!countEquips[eId]) countEquips[eId] = { serial: log.equipamentos?.serial || 'Desconhecido', modelo: log.equipamentos?.modelo || '-', count: 0 };
                countEquips[eId].count++;
                
                // Agrupar Tecnicos associados a devoluções
                const tId = log.tecnico_id;
                if (tId) {
                    if (!countTechs[tId]) countTechs[tId] = { nome: log.tecnicos?.nome || 'Desconhecido', count: 0 };
                    countTechs[tId].count++;
                }
            }
            if (log.tipo === 'tratamento_concluido' || log.tipo === 'TRATAMENTO') {
                totalTratamentos++;
            }
        });

        const rankingEquipamentos = Object.values(countEquips)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
            
        const rankingTecnicos = Object.values(countTechs)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.json({
            totalDevolucoes,
            totalTratamentos,
            rankingEquipamentos,
            rankingTecnicos
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// History of distributions
app.get('/api/distribuicoes', async (req, res) => {
    const { data, error } = await supabase
        .from('equipamentos')
        .select('num_interno, serial, data_distribuicao, tecnicos!inner(nome)')
        .eq('status', 'Em Estoque Técnico')
        .not('data_distribuicao', 'is', null)
        .is('deleted_at', null)
        .order('data_distribuicao', { ascending: false })
        .limit(20);
        
    if (error) return res.status(500).json({ error: error.message });
    
    const rows = data.map(eq => ({
        num_interno: eq.num_interno,
        serial: eq.serial,
        data_distribuicao: eq.data_distribuicao,
        tecnico_nome: eq.tecnicos.nome
    }));
    
    res.json(rows);
});

// -- Tecnicos --
app.get('/api/tecnicos', async (req, res) => {
    const { data: tecnicos, error: errTec } = await supabase.from('tecnicos').select('*');
    if (errTec) return res.status(500).json({ error: errTec.message });
    
    const { data: equipamentos, error: errEq } = await supabase
        .from('equipamentos')
        .select('tecnico_id')
        .eq('status', 'Em Estoque Técnico')
        .not('tecnico_id', 'is', null)
        .is('deleted_at', null);
        
    if (errEq) return res.status(500).json({ error: errEq.message });
    
    const countMap = {};
    equipamentos.forEach(e => {
        countMap[e.tecnico_id] = (countMap[e.tecnico_id] || 0) + 1;
    });
    
    const rows = tecnicos.map(t => ({
        ...t,
        qtd_estoque: countMap[t.id] || 0
    }));
    
    res.json(rows);
});

app.post('/api/tecnicos', restrictTo('master', 'gerente'), async (req, res) => {
    const { nome, cidade_principal, sub_cidades } = req.body;
    const { data, error } = await supabase
        .from('tecnicos')
        .insert([{ nome, cidade_principal, sub_cidades }])
        .select();
        
    if (error) return res.status(500).json({ error: error.message });

    if (data && data.length > 0) {
        logAudit(req.user.id, req.user.email, 'CADASTRAR', 'tecnicos', data[0].id, null, data[0]);
    }

    if (!data || data.length === 0) return res.json({ success: true, message: "Técnico adicionado (sem retorno de ID)" });
    res.json({ success: true, id: data[0].id });
});

// Update Technician
app.put('/api/tecnicos/:id', restrictTo('master', 'gerente'), async (req, res) => {
    const { id } = req.params;
    const { nome, cidade_principal, sub_cidades } = req.body;

    // Buscar dados antigos para o log
    const { data: antigo } = await supabase.from('tecnicos').select('*').eq('id', id).single();

    const { data, error } = await supabase
        .from('tecnicos')
        .update({ nome, cidade_principal, sub_cidades })
        .eq('id', id)
        .select();

    if (error) return res.status(500).json({ error: error.message });

    if (data && data.length > 0) {
        logAudit(req.user.id, req.user.email, 'EDITAR', 'tecnicos', id, antigo, data[0]);
    }

    res.json({ success: true, data: data[0] });
});

// Delete Technician
app.delete('/api/tecnicos/:id', restrictTo('master'), async (req, res) => {
    const { id } = req.params;
    
    // Check if technician has equipment first
    const { count, error: countError } = await supabase
        .from('equipamentos')
        .select('*', { count: 'exact', head: true })
        .eq('tecnico_id', id)
        .eq('status', 'Em Estoque Técnico');
    
    if (countError) return res.status(500).json({ error: countError.message });
    if (count > 0) return res.status(400).json({ error: "Não é possível excluir técnico com equipamentos em estoque." });

    // Buscar dados antigos para o log
    const { data: antigo } = await supabase.from('tecnicos').select('*').eq('id', id).single();

    const { error } = await supabase
        .from('tecnicos')
        .delete()
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    
    logAudit(req.user.id, req.user.email, 'EXCLUIR', 'tecnicos', id, antigo, null);

    res.json({ success: true });
});

app.get('/api/servicos', async (req, res) => {
    const { data, error } = await supabase
        .from('servicos')
        .select('*, equipamentos!inner(num_interno, serial), tecnicos!inner(nome)')
        .order('data', { ascending: false });
        
    if (error) return res.status(500).json({ error: error.message });
    
    const rows = data.map(s => ({
        ...s,
        num_interno: s.equipamentos.num_interno,
        serial: s.equipamentos.serial,
        tecnico_nome: s.tecnicos.nome
    }));
    
    res.json(rows);
});

app.post('/api/servicos', restrictTo('master', 'gerente', 'operador'), async (req, res) => {
    const { equipamento_id, tecnico_id, tipo_servico, data: clientData, placa_obs } = req.body;
    const srvData = clientData || new Date().toISOString();
    
    // Sequential update simulating basic transaction
    const isRemove = !tipo_servico.toLowerCase().includes('instalaç');
    let patchError;
    if (isRemove) {
        const { error } = await supabase.rpc('fluxo_registrar_devolucao', { 
            req_id: parseInt(equipamento_id), 
            usr_email: req.user.email, 
            placa_info: placa_obs || null, 
            origem_info: 'servico_operacional' 
        });
        patchError = error;
    } else {
        const { error } = await supabase.from('equipamentos').update({ status: 'Instalado' }).eq('id', equipamento_id);
        patchError = error;
    }
        
    if (patchError) return res.status(500).json({ error: patchError.message });
    
    const { error: insError } = await supabase
        .from('servicos')
        .insert([{ equipamento_id, tecnico_id, tipo_servico, data: srvData, placa_obs: placa_obs || '' }]);
        
    if (insError) return res.status(500).json({ error: insError.message });

    // Registrar no Histórico de Movimentações
    await supabase.from('historico_movimentacoes').insert([{
        equipamento_id,
        tecnico_id,
        tipo: 'INSTALACAO',
        placa: placa_obs || '',
        user_email: req.user.email,
        observacao: `Serviço: ${tipo_servico}`
    }]);
    
    res.json({ success: true, message: "Serviço registrado com sucesso." });
});

app.post('/api/servicos/bulk', restrictTo('master', 'gerente', 'operador'), async (req, res) => {
    const payloads = req.body; // array of { serial, tipo_servico, data, placa_obs }
    const today = new Date().toISOString();
    
    const { data: eqs, error: errEq } = await supabase
        .from('equipamentos')
        .select('id, tecnico_id, serial')
        .eq('status', 'Em Estoque Técnico');
        
    if (errEq) return res.status(500).json({ error: errEq.message });
    
    const eqMap = {};
    eqs.forEach(eq => eqMap[String(eq.serial).trim()] = eq);

    const validSrv = payloads.map(p => {
        const match = eqMap[String(p.serial).trim()];
        if(match && p.tipo_servico) {
            return {
                equipamento_id: match.id,
                tecnico_id: match.tecnico_id,
                tipo_servico: p.tipo_servico,
                data: p.data || today,
                placa_obs: p.placa_obs || ''
            };
        }
        return null;
    }).filter(x => x !== null);

    if (validSrv.length === 0) return res.json({ success: true, count: 0 });
    
    const eqIds = validSrv.map(s => s.equipamento_id);
    
    for (const eq of eqs) {
         const { error } = await supabase.rpc('fluxo_registrar_devolucao', {
             req_id: parseInt(eq.id),
             usr_email: req.user.email,
             placa_info: serialMap[eq.serial] || null,
             origem_info: 'recolhimento_em_massa'
         });
         if (error) return res.status(500).json({ error: error.message });
    }
    
    // Insere logs do servico
    const srvPayloads = eqs.map(eq => ({
        equipamento_id: eq.id,
        tecnico_id: eq.tecnico_id,
        tipo_servico: 'Desinstalação / Recolhimento',
        data: today,
        placa_obs: serialMap[eq.serial] || '-'
    }));
    await supabase.from('servicos').insert(srvPayloads);
    
    res.json({ success: true, changes: eqs.length });
});

// Tratamento concluído (Mover de Pendente para Disponível)
app.post('/api/equipamentos/tratar', restrictTo('master', 'gerente'), async (req, res) => {
    const { ids } = req.body; // Array de IDs
    if (!ids || !ids.length) return res.status(400).json({ error: "IDs não fornecidos" });

    for (const idi of ids) {
        const { error } = await supabase.rpc('fluxo_finalizar_tratamento', { req_id: parseInt(idi), usr_email: req.user.email });
        if(error) return res.status(403).json({ error: error.message });
    }

    res.json({ success: true, message: `Equipamentos tratados: ${ids.length}` });
});

// Buscar Histórico de um Rastreador
app.get('/api/equipamentos/:id/historico', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('historico_movimentacoes')
        .select('*, tecnicos(nome)')
        .eq('equipamento_id', id)
        .order('data', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    
    const rows = data.map(h => ({
        ...h,
        tecnico_nome: h.tecnicos ? h.tecnicos.nome : null
    }));

    res.json(rows);
});

// -- Relatórios --
app.get('/api/relatorios/devolucoes', async (req, res) => {
    try {
        // Buscar todas as devoluções do histórico
        const { data: history, error } = await supabase
            .from('historico_movimentacoes')
            .select('equipamento_id, tipo, data, placa, tecnico_id, tecnicos(nome), equipamentos(num_interno, serial, modelo, status)')
            .eq('tipo', 'DEVOLUCAO');

        if (error) throw error;

        // Agrupar por equipamento
        const stats = {};
        history.forEach(log => {
            const eqId = log.equipamento_id;
            
            // Se o equipamento não existe mais (foi deletado), ignoramos no relatório gerencial
            if (!log.equipamentos) return;

            if (!stats[eqId]) {
                stats[eqId] = {
                    equipamento_id: eqId,
                    num_interno: log.equipamentos.num_interno,
                    serial: log.equipamentos.serial,
                    modelo: log.equipamentos.modelo,
                    status_atual: log.equipamentos.status, // Adicionado status
                    qtd_devolucoes: 0,
                    ultima_devolucao: null,
                    ultimo_tecnico: null,
                    ultima_placa: null
                };
            }
            stats[eqId].qtd_devolucoes++;
            
            // Manter o registro mais recente
            if (!stats[eqId].ultima_devolucao || new Date(log.data) > new Date(stats[eqId].ultima_devolucao)) {
                stats[eqId].ultima_devolucao = log.data;
                stats[eqId].ultimo_tecnico = log.tecnicos ? log.tecnicos.nome : 'N/A';
                stats[eqId].ultima_placa = log.placa || '-';
            }
        });

        res.json(Object.values(stats));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -- Configuracoes --
app.get('/api/configuracoes', async (req, res) => {
    const { data, error } = await supabase.from('configuracoes').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.put('/api/configuracoes/:chave', restrictTo('master', 'gerente'), async (req, res) => {
    const { valor } = req.body;
    const { error } = await supabase
        .from('configuracoes')
        .update({ valor })
        .eq('chave', req.params.chave);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// -- Usuários (Apenas Master) --
app.get('/api/users', restrictTo('master'), async (req, res) => {
    const { data, error } = await supabase
        .from('perfis')
        .select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/users', restrictTo('master'), async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'Dados incompletos' });

    // Criar usuário no Auth (Admin API)
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    if (authError) return res.status(500).json({ error: authError.message });

    // O trigger 'on_auth_user_created' já cria o perfil, 
    // mas precisamos atualizar o 'role' se for diferente do padrão 'visualizador'
    if (role !== 'visualizador') {
        const { error: roleError } = await supabase
            .from('perfis')
            .update({ role })
            .eq('id', user.id);
        if (roleError) return res.status(500).json({ error: roleError.message });
    }

    logAudit(req.user.id, req.user.email, 'CADASTRAR_USUARIO', 'perfis', user.id, null, { email, role });

    res.json({ success: true, user });
});

app.put('/api/users/:id/role', restrictTo('master'), async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    // Buscar antigo
    const { data: antigo } = await supabase.from('perfis').select('*').eq('id', id).single();

    const { data, error } = await supabase
        .from('perfis')
        .update({ role })
        .eq('id', id)
        .select();

    if (error) return res.status(500).json({ error: error.message });

    logAudit(req.user.id, req.user.email, 'ALTERAR_PERMISSAO', 'perfis', id, antigo, data[0]);

    res.json({ success: true, data: data[0] });
});

app.delete('/api/users/:id', restrictTo('master'), async (req, res) => {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });

    // Buscar antigo
    const { data: antigo } = await supabase.from('perfis').select('*').eq('id', id).single();

    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) return res.status(500).json({ error: authError.message });

    logAudit(req.user.id, req.user.email, 'EXCLUIR_USUARIO', 'perfis', id, antigo, null);

    res.json({ success: true });
});

// -- Logs de Auditoria (Master e Gerente) --
app.get('/api/audit', restrictTo('master', 'gerente'), async (req, res) => {
    const { data, error } = await supabase
        .from('logs_auditoria')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Dashboard stats
app.get('/api/stats', async (req, res) => {
    const stats = { totalEq: 0, dispEq: 0, techEq: 0, instEq: 0, pendEq: 0, top_techs: [], chart_techs: [], last_services: [] };
    
    try {
        const [
            { count: totalEq },
            { count: dispEq },
            { count: techEq },
            { count: instEq },
            { count: pendEq },
            { data: techQs },
            { data: srvs }
        ] = await Promise.all([
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).is('deleted_at', null),
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'Disponível').is('deleted_at', null),
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'Em Estoque Técnico').is('deleted_at', null),
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'Instalado').is('deleted_at', null),
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'Pendente').is('deleted_at', null),
            
            // To get grouping equivalent: Fetch all Em Estoque and group in memory
            supabase.from('equipamentos').select('tecnico_id, tecnicos!tecnico_id(nome)').eq('status', 'Em Estoque Técnico').not('tecnico_id', 'is', null).is('deleted_at', null),
            
            supabase.from('servicos').select('data, tipo_servico, equipamentos!inner(serial), tecnicos!inner(nome)').order('data', { ascending: false }).limit(10)
        ]);
        
        stats.totalEq = totalEq || 0;
        stats.dispEq = dispEq || 0;
        stats.techEq = techEq || 0;
        stats.instEq = instEq || 0;
        stats.pendEq = pendEq || 0;
        
        const tCount = {};
        const tName = {};
        if (techQs) {
            techQs.forEach(row => {
                const id = row.tecnico_id;
                tCount[id] = (tCount[id] || 0) + 1;
                tName[id] = row.tecnicos.nome;
            });
        }
        
        const sortedTechs = Object.keys(tCount)
            .map(id => ({ tecnico_nome: tName[id], count: tCount[id] }))
            .sort((a, b) => b.count - a.count);
            
        stats.chart_techs = sortedTechs;
        stats.top_techs = sortedTechs.slice(0, 5);
        
        if (srvs) {
            stats.last_services = srvs.map(s => ({
                data: s.data,
                tipo_servico: s.tipo_servico,
                serial: s.equipamentos.serial,
                tecnico_nome: s.tecnicos.nome
            }));
        }
        
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`STOKI Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
