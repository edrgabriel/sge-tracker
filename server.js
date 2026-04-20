const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==== API ROUTES ====

// -- Equipamentos --
app.get('/api/equipamentos', async (req, res) => {
    const { data, error } = await supabase
        .from('equipamentos')
        .select('*, tecnicos(nome)');
        
    if (error) return res.status(500).json({ error: error.message });
    
    // Map tecnicos(nome) to tecnico_nome to maintain API compatibility with frontend
    const rows = data.map(eq => ({
        ...eq,
        tecnico_nome: eq.tecnicos ? eq.tecnicos.nome : null
    }));
    
    res.json(rows);
});

app.post('/api/equipamentos', async (req, res) => {
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
    res.json({ success: true, id: data[0].id });
});

app.post('/api/equipamentos/bulk', async (req, res) => {
    const equipamentos = req.body; 
    
    const payloads = equipamentos.map(eq => ({
        num_interno: eq.num_interno,
        serial: eq.serial,
        status: 'Disponível',
        modelo: eq.modelo || null
    }));
    
    const { data, error } = await supabase
        .from('equipamentos')
        .upsert(payloads, { onConflict: 'num_interno', ignoreDuplicates: false });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, count: equipamentos.length });
});

// Update Status/Assign to technician
app.put('/api/equipamentos/:id', async (req, res) => {
    const id = req.params.id;
    const { status, tecnico_id } = req.body;
    
    const updatePayload = { status };
    if (tecnico_id !== undefined) updatePayload.tecnico_id = tecnico_id;
    
    // Config current date if status goes to Em Estoque
    if (status === 'Em Estoque Técnico' && tecnico_id) {
        updatePayload.data_distribuicao = new Date().toISOString();
    }
    
    const { data, error } = await supabase
        .from('equipamentos')
        .update(updatePayload)
        .eq('id', id);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, changes: 1 });
});

// Bulk assign to technician (Legacy for excel upload)
app.post('/api/equipamentos/assign', async (req, res) => {
    const { ids, tecnico_id } = req.body;
    if (!ids || !ids.length || !tecnico_id) return res.status(400).json({ error: "Missing data" });

    const today = new Date().toISOString();
    
    const { data, error } = await supabase
        .from('equipamentos')
        .update({ status: 'Em Estoque Técnico', tecnico_id, data_distribuicao: today })
        .in('id', ids);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, changes: ids.length });
});

// Dynamic Movement for Individual Assignment (Assign, Transfer, Devolve)
app.post('/api/equipamentos/move', async (req, res) => {
    const { ids, action, tecnico_id } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: "Missing ids" });

    let updatePayload = {};
    if (action === 'devolve') {
        updatePayload = { status: 'Disponível', tecnico_id: null, data_distribuicao: null };
    } else if (action === 'assign' || action === 'transfer') {
        if (!tecnico_id) return res.status(400).json({ error: "Missing Target Technician ID" });
        updatePayload = { status: 'Em Estoque Técnico', tecnico_id, data_distribuicao: new Date().toISOString() };
    } else {
        return res.status(400).json({ error: "Invalid action" });
    }
    
    const { data, error } = await supabase
        .from('equipamentos')
        .update(updatePayload)
        .in('id', ids);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, changes: ids.length });
});


// History of distributions
app.get('/api/distribuicoes', async (req, res) => {
    const { data, error } = await supabase
        .from('equipamentos')
        .select('num_interno, serial, data_distribuicao, tecnicos!inner(nome)')
        .eq('status', 'Em Estoque Técnico')
        .not('data_distribuicao', 'is', null)
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
        .not('tecnico_id', 'is', null);
        
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

app.post('/api/tecnicos', async (req, res) => {
    const { nome, cidade_principal, sub_cidades } = req.body;
    const { data, error } = await supabase
        .from('tecnicos')
        .insert([{ nome, cidade_principal, sub_cidades }])
        .select();
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, id: data[0].id });
});

// -- Servicos --
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

app.post('/api/servicos', async (req, res) => {
    const { equipamento_id, tecnico_id, tipo_servico, data: clientData, placa_obs } = req.body;
    const srvData = clientData || new Date().toISOString();
    
    // Sequential update simulating basic transaction
    const { error: patchError } = await supabase
        .from('equipamentos')
        .update({ status: 'Instalado' })
        .eq('id', equipamento_id);
        
    if (patchError) return res.status(500).json({ error: patchError.message });
    
    const { error: insError } = await supabase
        .from('servicos')
        .insert([{ equipamento_id, tecnico_id, tipo_servico, data: srvData, placa_obs: placa_obs || '' }]);
        
    if (insError) {
        // Rollback
        await supabase.from('equipamentos').update({ status: 'Disponível' }).eq('id', equipamento_id);
        return res.status(500).json({ error: insError.message });
    }
    
    res.json({ success: true, message: "Serviço registrado com sucesso." });
});

app.post('/api/servicos/bulk', async (req, res) => {
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
    
    const { error: updErr } = await supabase
        .from('equipamentos')
        .update({ status: 'Instalado' })
        .in('id', eqIds);
        
    if (updErr) return res.status(500).json({ error: updErr.message });
    
    const { error: insErr } = await supabase
        .from('servicos')
        .insert(validSrv);
        
    if (insErr) {
        // Rollback
        await supabase.from('equipamentos').update({ status: 'Em Estoque Técnico' }).in('id', eqIds);
        return res.status(500).json({ error: insErr.message });
    }
    
    res.json({ success: true, count: validSrv.length });
});

// Recolher equipamentos instalados de volta para base
app.post('/api/equipamentos/recolher', async (req, res) => {
    const payloads = req.body; // array of { serial, placa_obs } or strings
    if (!payloads || !payloads.length) return res.status(400).json({ error: "Missing data" });

    const paramsArray = payloads.map(p => {
        if (typeof p === 'string') return { serial: p, placa_obs: '' };
        return { serial: p.serial, placa_obs: p.placa_obs || p.placa || p.obs || '' };
    }).filter(x => x.serial);

    if (paramsArray.length === 0) return res.json({ success: true, changes: 0 });

    const serials = paramsArray.map(p => p.serial);

    const { data: eqs, error: errEq } = await supabase
        .from('equipamentos')
        .select('id, tecnico_id, serial')
        .eq('status', 'Instalado')
        .in('serial', serials);
        
    if (errEq) return res.status(500).json({ error: errEq.message });
    if (!eqs || eqs.length === 0) return res.json({ success: true, changes: 0 });

    const serialMap = {};
    paramsArray.forEach(p => serialMap[p.serial] = p.placa_obs);

    const today = new Date().toISOString();
    const eqIds = eqs.map(e => e.id);
    
    const { error: updErr } = await supabase
        .from('equipamentos')
        .update({ status: 'Disponível', tecnico_id: null, data_distribuicao: null })
        .in('id', eqIds);
        
    if (updErr) return res.status(500).json({ error: updErr.message });
    
    const srvPayloads = eqs.map(eq => ({
        equipamento_id: eq.id,
        tecnico_id: eq.tecnico_id,
        tipo_servico: 'Desinstalação / Recolhimento',
        data: today,
        placa_obs: serialMap[eq.serial] || '-'
    }));

    const { error: insErr } = await supabase.from('servicos').insert(srvPayloads);
    if (insErr) console.error("Service log failed:", insErr.message); // non-fatal
    
    res.json({ success: true, changes: eqs.length });
});

// -- Configuracoes --
app.get('/api/configuracoes', async (req, res) => {
    const { data, error } = await supabase.from('configuracoes').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.put('/api/configuracoes/:chave', async (req, res) => {
    const { valor } = req.body;
    const { error } = await supabase
        .from('configuracoes')
        .update({ valor })
        .eq('chave', req.params.chave);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// Dashboard stats
app.get('/api/stats', async (req, res) => {
    const stats = { totalEq: 0, dispEq: 0, techEq: 0, instEq: 0, top_techs: [], chart_techs: [], last_services: [] };
    
    try {
        const [
            { count: totalEq },
            { count: dispEq },
            { count: techEq },
            { count: instEq },
            { data: techQs },
            { data: srvs }
        ] = await Promise.all([
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }),
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'Disponível'),
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'Em Estoque Técnico'),
            supabase.from('equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'Instalado'),
            
            // To get grouping equivalent: Fetch all Em Estoque and group in memory
            supabase.from('equipamentos').select('tecnico_id, tecnicos(nome)').eq('status', 'Em Estoque Técnico').not('tecnico_id', 'is', null),
            
            supabase.from('servicos').select('data, tipo_servico, equipamentos!inner(serial), tecnicos!inner(nome)').order('data', { ascending: false }).limit(10)
        ]);
        
        stats.totalEq = totalEq || 0;
        stats.dispEq = dispEq || 0;
        stats.techEq = techEq || 0;
        stats.instEq = instEq || 0;
        
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
app.listen(PORT, () => {
    console.log(`STOKI Server running at http://localhost:${PORT}`);
});

module.exports = app;
