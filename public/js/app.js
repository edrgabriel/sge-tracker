const API_URL = '/api';

// === PERMISSIONS ===
function applyPermissions() {
    const role = localStorage.getItem('stoki_role') || 'visualizador';
    const email = localStorage.getItem('stoki_email') || 'Usuário';

    const emailEl = document.getElementById('user-display-email');
    const roleEl = document.getElementById('user-display-role');
    if (emailEl) emailEl.innerText = email;
    if (roleEl) roleEl.innerText = role;

    // Sidebar Tabs
    const navUsers = document.getElementById('nav-usuarios');
    const navLogs = document.getElementById('nav-logs');

    if (role === 'master') {
        if (navUsers) navUsers.style.setProperty('display', 'flex', 'important');
        if (navLogs) navLogs.style.display = 'flex';
    } else if (role === 'gerente') {
        if (navLogs) navLogs.style.display = 'flex';
    }

    // Ocultar botões baseado no cargo (Lógica global)
    if (role === 'visualizador') {
        document.querySelectorAll('.btn-primary, .fab-container').forEach(el => {
            const txt = el.innerText.toLowerCase();
            const exceptions = ['exportar', 'baixar', 'relatório', 'gerar'];
            const shouldHide = !exceptions.some(ex => txt.includes(ex));
            if (shouldHide) el.style.display = 'none';
        });
    }

    if (role === 'operador') {
        document.querySelectorAll('[data-target="configuracoes"]').forEach(el => el.style.display = 'none');
    }
}

function hasPermission(action) {
    const role = localStorage.getItem('stoki_role');
    if (role === 'master') return true;
    if (action === 'delete') return false; 
    if (role === 'gerente') return ['create', 'edit', 'move', 'report'].includes(action);
    if (role === 'operador') return ['move', 'create_service'].includes(action);
    return false;
}

// === VIEW NAVIGATION ===
document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        const target = item.getAttribute('data-target');
        document.querySelectorAll('.view-section').forEach(section => section.classList.remove('active'));
        document.getElementById(`view-${target}`).classList.add('active');
        
        // Update Title
        document.getElementById('page-title').innerText = item.innerText.trim();
        
        // Load respective data
        loadViewData(target);
        applyPermissions(); // Re-apply to ensure inner buttons are hidden/shown
    });
});

function loadViewData(view) {
    if (view === 'dashboard') loadDashboard();
    if (view === 'equipamentos') loadEquipamentos();
    if (view === 'tecnicos') loadTecnicos();
    if (view === 'distribuicao') loadDistribuicao();
    if (view === 'servicos') {
        loadServicos();
        loadServiceFormData();
    }
    if (view === 'configuracoes') loadConfiguracoes();
    if (view === 'relatorios') loadRelatorios();
    if (view === 'templates') { /* static view */ }
    if (view === 'usuarios') loadUsuarios();
    if (view === 'logs') loadLogs();
}

// === ON LOAD ===
document.addEventListener('DOMContentLoaded', () => {
    // Escutar a sincronização do Auth (vindo do auth.js)
    window.addEventListener('stokiAuthReady', () => {
        console.log('Auth pronto capturado no app.js, aplicando permissões...');
        loadDashboard();
        loadConfiguracoes();
        applyPermissions();
    });

    // Fallback caso já esteja no localStorage (evita delay se já temos os dados)
    if (localStorage.getItem('stoki_role')) {
        loadDashboard();
        loadConfiguracoes();
        applyPermissions();
    }
});

// === MODAL HELPERS ===
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        console.log(`Abrindo modal: ${id}`);
        modal.classList.add('active');
        setTimeout(() => {
            console.log(`Estilo computado do modal ${id}:`, window.getComputedStyle(modal).display);
        }, 50);
    } else {
        console.error(`Erro: Modal com ID "${id}" não encontrado!`);
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Bind to window to ensure HTML onclick can always find them
window.openModal = openModal;
window.closeModal = closeModal;

// === DASHBOARD ===
let chartObjStatus = null;
let chartObjTechs = null;

async function loadDashboard() {
    try {
        const res = await apiFetch(`${API_URL}/stats`);
        const stats = await res.json();
        document.getElementById('stat-total').innerText = stats.totalEq || 0;
        document.getElementById('stat-disp').innerText = stats.dispEq || 0;
        document.getElementById('stat-tech').innerText = stats.techEq || 0;
        document.getElementById('stat-inst').innerText = stats.instEq || 0;
        
        // Render Pie Chart Status
        const ctxStatus = document.getElementById('chartStatus').getContext('2d');
        if (chartObjStatus) chartObjStatus.destroy();
        chartObjStatus = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['Disponível', 'Estoque', 'Instalado'],
                datasets: [{
                    data: [stats.dispEq || 0, stats.techEq || 0, stats.instEq || 0],
                    backgroundColor: ['#10b981', '#f59e0b', '#8b5cf6'],
                    borderWidth: 0
                }]
            },
            options: { cutout: '70%', plugins: { legend: { position: 'bottom' } } }
        });

        // Render Bar Chart Techs
        const ctxTechs = document.getElementById('chartTechs').getContext('2d');
        if (chartObjTechs) chartObjTechs.destroy();
        
        const chartLabels = (stats.chart_techs || []).map(t => t.tecnico_nome);
        const chartData = (stats.chart_techs || []).map(t => t.count);

        chartObjTechs = new Chart(ctxTechs, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Qtd de Equipamentos',
                    data: chartData,
                    backgroundColor: '#3b82f6',
                    borderRadius: 5
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });

        // Render Top 5 Techs
        const tbodyTop = document.getElementById('tbody-top-techs');
        tbodyTop.innerHTML = '';
        (stats.top_techs || []).forEach(t => {
            tbodyTop.innerHTML += `<tr><td><strong>${t.tecnico_nome}</strong></td><td>${t.count} peças</td></tr>`;
        });
        
        // Render Last 10 Services
        const tbodyLast = document.getElementById('tbody-last-srvs');
        tbodyLast.innerHTML = '';
        (stats.last_services || []).forEach(s => {
            const dateStr = new Date(s.data).toLocaleDateString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            tbodyLast.innerHTML += `<tr>
                <td>${dateStr}</td>
                <td><strong>${s.tecnico_nome}</strong></td>
                <td>${s.serial}</td>
                <td><span style="font-size:0.8rem; background:rgba(59,130,246,0.1); color:#3b82f6; padding:4px 8px; border-radius:5px;">${s.tipo_servico}</span></td>
            </tr>`;
        });
        
    } catch(e) { console.error(e); }
}

// === EQUIPAMENTOS ===
let allEquipamentos = [];
let pendingExcelPayload = [];

function switchEquipTab(tab) {
    document.querySelectorAll('#view-equipamentos .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#view-equipamentos .tab-content').forEach(c => c.style.display = 'none');
    
    event.target.classList.add('active');
    document.getElementById(`equip-tab-${tab}`).style.display = 'block';
    
    if(tab === 'lista') loadEquipamentos();
}

async function loadEquipamentos() {
    try {
        const res = await apiFetch(`${API_URL}/equipamentos`);
        allEquipamentos = await res.json();
        filterEquipamentos();
    } catch(e) { console.error(e); }
}

function filterEquipamentos() {
    const fStatus = document.getElementById('filter-eq-status').value.toLowerCase();
    const fNum = document.getElementById('filter-eq-num').value.toLowerCase();
    const fSer = document.getElementById('filter-eq-ser').value.toLowerCase();
    const fTec = document.getElementById('filter-eq-tec').value.toLowerCase();

    const filtered = allEquipamentos.filter(eq => {
        const matchStatus = fStatus ? eq.status.toLowerCase().includes(fStatus) : true;
        const matchNum = fNum ? eq.num_interno.toLowerCase().includes(fNum) : true;
        const matchSer = fSer ? eq.serial.toLowerCase().includes(fSer) : true;
        const matchTec = fTec ? (eq.tecnico_nome || '').toLowerCase().includes(fTec) : true;
        return matchStatus && matchNum && matchSer && matchTec;
    });

    const tbody = document.getElementById('tbody-equipamentos');
    tbody.innerHTML = '';
    filtered.forEach(eq => {
        const canEdit = hasPermission('edit');
        const canDelete = hasPermission('delete');

        let statusClass = 'disponivel';
        if (eq.status === 'Em Estoque Técnico') statusClass = 'estoque';
        if (eq.status === 'Instalado') statusClass = 'instalado';
        
        let dDate = eq.data_distribuicao ? new Date(eq.data_distribuicao).toLocaleDateString('pt-BR') : '-';

        tbody.innerHTML += `
            <tr>
                <td><strong>${eq.num_interno}</strong></td>
                <td>${eq.modelo || '-'}</td>
                <td>${eq.serial}</td>
                <td><span class="status-badge ${statusClass}">${eq.status}</span></td>
                <td>${eq.tecnico_nome || '-'}</td>
                <td>${dDate}</td>
                <td>
                    <div style="display:flex; gap:8px;">
                        ${canEdit ? `
                        <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.8rem;" onclick="editEquipamento(${eq.id})" title="Editar">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>` : ''}
                        ${canDelete ? `
                        <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.8rem; color:var(--danger);" onclick="deleteEquipamento(${eq.id})" title="Excluir">
                            <i class="fa-solid fa-trash"></i>
                        </button>` : ''}
                        ${!canEdit && !canDelete ? '<span>-</span>' : ''}
                    </div>
                </td>
            </tr>
        `;
    });
}

async function saveEquipamento() {
    const num = document.getElementById('eq-num').value.trim();
    const serial = document.getElementById('eq-serial').value.trim();
    const modelo = document.getElementById('eq-modelo').value;
    
    if(!num || !serial) return Swal.fire('Atenção', 'Preencha todos os campos!', 'warning');
    if(num.length > 5) return Swal.fire('Atenção', 'O Número Interno deve ter no máximo 5 dígitos!', 'warning');
    
    try {
        const res = await apiFetch(`${API_URL}/equipamentos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ num_interno: num, serial: serial, status: 'Disponível', modelo: modelo })
        });
        
        if (res.ok) {
            Swal.fire('Sucesso', 'Equipamento adicionado!', 'success').then(() => {
                document.getElementById('eq-num').value = '';
                document.getElementById('eq-serial').value = '';
                document.querySelector('[onclick="switchEquipTab(\'lista\')"]').click();
            });
        } else {
            const err = await res.json();
            Swal.fire('Erro', err.error || err.message || 'Falha ao salvar', 'error');
        }
    } catch(e) { console.error(e); }
}

function editEquipamento(id) {
    const eq = allEquipamentos.find(e => e.id === id);
    if (!eq) return;

    document.getElementById('edit-eq-id').value = eq.id;
    document.getElementById('edit-eq-num').value = eq.num_interno;
    document.getElementById('edit-eq-serial').value = eq.serial;
    document.getElementById('edit-eq-modelo-list').value = eq.modelo || '';

    openModal('modal-edit-equipamento');
}

async function updateEquipamento() {
    const id = document.getElementById('edit-eq-id').value;
    const num = document.getElementById('edit-eq-num').value.trim();
    const serial = document.getElementById('edit-eq-serial').value.trim();
    const modelo = document.getElementById('edit-eq-modelo-list').value;

    if (!num || !serial) return Swal.fire('Atenção', 'Preencha Número Interno e Serial!', 'warning');

    try {
        const res = await apiFetch(`${API_URL}/equipamentos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ num_interno: num, serial: serial, modelo: modelo })
        });

        if (res.ok) {
            Swal.fire('Sucesso', 'Equipamento atualizado!', 'success');
            closeModal('modal-edit-equipamento');
            loadEquipamentos();
        } else {
            const err = await res.json();
            Swal.fire('Erro', err.error || 'Falha ao atualizar', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Erro', 'Erro de conexão.', 'error');
    }
}

async function deleteEquipamento(id) {
    const result = await Swal.fire({
        title: 'Tem certeza?',
        text: "Esta ação não pode ser revertida!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const res = await apiFetch(`${API_URL}/equipamentos/${id}`, { method: 'DELETE' });
            if (res.ok) {
                Swal.fire('Deletado!', 'Equipamento excluído com sucesso.', 'success');
                loadEquipamentos();
            } else {
                const err = await res.json();
                Swal.fire('Erro', err.error || 'Falha ao excluir', 'error');
            }
        } catch (e) {
            console.error(e);
            Swal.fire('Erro', 'Erro de conexão.', 'error');
        }
    }
}

// === EXCEL MULTIPLE UPLOAD PREVIEW ===
function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet);
        
        // Map columns
        pendingExcelPayload = json.map(row => {
            const num = row['numero_interno'] || row['Num Interno'] || row['num_interno'] || row['Nº Interno'] || String(Object.values(row)[0] || '');
            const modelo = row['modelo'] || row['Modelo'] || null;
            const ser = row['serial'] || row['Serial'] || String(Object.values(row)[1] || '');
            return { num_interno: String(num).trim(), modelo: modelo, serial: String(ser).trim() };
        }).filter(item => item.num_interno && item.serial && item.num_interno !== 'undefined');

        if (pendingExcelPayload.length === 0) {
            event.target.value = '';
            return Swal.fire('Atenção', 'Nenhum dado válido encontrado na planilha. Verifique os nomes das colunas.', 'warning');
        }

        renderPreviewExcel();
    };
    reader.readAsArrayBuffer(file);
    event.target.value = ''; // Reset input
}

function renderPreviewExcel() {
    const tbody = document.getElementById('tbody-preview');
    tbody.innerHTML = '';
    let hasErrors = false;

    pendingExcelPayload.forEach(item => {
        let errorMsg = '';
        if (item.num_interno.length > 5) {
            errorMsg = 'Nº Interno excedeu 5 dígitos';
            hasErrors = true;
        }

        const validHtml = errorMsg 
            ? `<span style="color:var(--danger); font-weight:bold"><i class="fa-solid fa-triangle-exclamation"></i> ${errorMsg}</span>` 
            : `<span style="color:var(--success);"><i class="fa-solid fa-check"></i> OK</span>`;

        tbody.innerHTML += `
            <tr>
                <td>${item.num_interno}</td>
                <td>${item.modelo || '-'}</td>
                <td>${item.serial}</td>
                <td>${validHtml}</td>
            </tr>
        `;
    });

    const msg = document.getElementById('preview-msg');
    const btnConfirm = document.getElementById('btn-confirma-upload');
    
    if (hasErrors) {
        msg.innerHTML = `<span style="color:var(--danger)">Há erros na planilha. Corrija-os antes de enviar.</span>`;
        btnConfirm.disabled = true;
    } else {
        msg.innerHTML = `<strong>${pendingExcelPayload.length}</strong> itens prontos para serem salvos.`;
        btnConfirm.disabled = false;
    }

    openModal('modal-preview-excel');
}

function cancelarUploadLote() {
    pendingExcelPayload = [];
    closeModal('modal-preview-excel');
}

async function confirmarUploadLote() {
    if(pendingExcelPayload.length === 0) return;

    document.getElementById('btn-confirma-upload').disabled = true;
    try {
        const res = await apiFetch(`${API_URL}/equipamentos/bulk`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(pendingExcelPayload)
        });
        if (res.ok) {
            closeModal('modal-preview-excel');
            Swal.fire('Sucesso', `${pendingExcelPayload.length} equipamentos importados!`, 'success').then(() => {
                document.querySelector('[onclick="switchEquipTab(\'lista\')"]').click();
            });
        } else {
            const err = await res.json();
            Swal.fire('Erro', err.error || 'Falha na inserção do banco.', 'error');
        }
    } catch(err) { 
        console.error(err); 
        Swal.fire('Erro', 'Ocorreu um problema ao conectar com o servidor.', 'error');
    }
    document.getElementById('btn-confirma-upload').disabled = false;
}

// === TÉCNICOS ===
async function loadTecnicos() {
    try {
        const res = await apiFetch(`${API_URL}/tecnicos`);
        const data = await res.json();
        const tbody = document.getElementById('tbody-tecnicos');
        tbody.innerHTML = '';
        data.forEach(t => {
            // Parse sub-cidades
            let subHTML = '-';
            if (t.sub_cidades) {
                subHTML = t.sub_cidades.split(',').map(s => 
                    `<span style="font-size:0.75rem; background:rgba(59,130,246,0.1); color:#3b82f6; padding:4px 8px; border-radius:5px; margin: 2px; display: inline-block;">${s.trim()}</span>`
                ).join('');
            }
            
                const canEdit = hasPermission('edit');
                const canDelete = hasPermission('delete');

                tbody.innerHTML += `
                    <tr>
                        <td>${t.id}</td>
                        <td><strong>${t.nome}</strong></td>
                        <td>${t.cidade_principal}</td>
                        <td>${subHTML}</td>
                        <td><span class="status-badge estoque" style="font-size:0.9rem">${t.qtd_estoque || 0}</span></td>
                        <td>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="verEstoqueTecnico(${t.id}, '${t.nome}', '${t.cidade_principal}', '${t.sub_cidades || ''}')">
                                    <i class="fa-solid fa-box-open"></i> Ver
                                </button>
                                ${canEdit ? `
                                <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="editTecnico(${t.id}, '${t.nome}', '${t.cidade_principal}', '${t.sub_cidades || ''}')" title="Editar">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>` : ''}
                                ${canDelete ? `
                                <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.8rem; color:var(--danger);" onclick="deleteTecnico(${t.id})" title="Excluir">
                                    <i class="fa-solid fa-trash"></i>
                                </button>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
        });
    } catch(e) { console.error(e); }
}

let tecIdForServico = null;

async function verEstoqueTecnico(id, nome, cidade, subcidades) {
    tecIdForServico = id;
    document.getElementById('modal-ver-estoque-title').innerText = `Estoque - Técnico(a) ${nome}`;
    document.getElementById('modal-estoque-cidade').innerText = cidade || '-';
    document.getElementById('modal-estoque-subs').innerText = subcidades || 'Nenhuma';
    const tbody = document.getElementById('tbody-estoque-tecnico');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Carregando...</td></tr>';
    openModal('modal-ver-estoque');
    
    try {
        const res = await apiFetch(`${API_URL}/equipamentos`);
        const eqs = await res.json();
        const myEqs = eqs.filter(e => e.tecnico_id === id && e.status === 'Em Estoque Técnico');
        
        tbody.innerHTML = '';
        if(myEqs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Estoque vazio.</td></tr>';
            return;
        }
        
        myEqs.forEach(eq => {
            const dt = eq.data_distribuicao ? new Date(eq.data_distribuicao).toLocaleDateString('pt-BR') : '-';
            tbody.innerHTML += `
                <tr>
                    <td>${dt}</td>
                    <td><strong>${eq.num_interno}</strong></td>
                    <td>${eq.serial}</td>
                </tr>
            `;
        });
    } catch(e) { console.error(e); }
}

async function saveTecnico() {
    const nome = document.getElementById('tec-nome').value;
    const cid = document.getElementById('tec-cidade').value;
    const sub = document.getElementById('tec-sub').value;
    
    if(!nome || !cid) return Swal.fire('Atenção', 'Nome e Cidade são obrigatórios!', 'warning');
    
    try {
        const res = await apiFetch(`${API_URL}/tecnicos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome, cidade_principal: cid, sub_cidades: sub })
        });
        
        if (res.ok) {
            Swal.fire('Sucesso', 'Técnico adicionado!', 'success');
            closeModal('modal-add-tecnico');
            loadTecnicos();
        } else {
            const err = await res.json();
            Swal.fire('Erro', err.error || err.message || 'Falha ao salvar', 'error');
        }
    } catch(e) { console.error(e); }
}

function editTecnico(id, nome, cidade, sub) {
    document.getElementById('edit-tec-id').value = id;
    document.getElementById('edit-tec-nome').value = nome;
    document.getElementById('edit-tec-cidade').value = cidade;
    document.getElementById('edit-tec-sub').value = sub;
    openModal('modal-edit-tecnico');
}

async function updateTecnico() {
    const id = document.getElementById('edit-tec-id').value;
    const nome = document.getElementById('edit-tec-nome').value;
    const cid = document.getElementById('edit-tec-cidade').value;
    const sub = document.getElementById('edit-tec-sub').value;

    if (!nome || !cid) return Swal.fire('Atenção', 'Nome e Cidade são obrigatórios!', 'warning');

    try {
        const res = await apiFetch(`${API_URL}/tecnicos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, cidade_principal: cid, sub_cidades: sub })
        });

        if (res.ok) {
            Swal.fire('Sucesso', 'Técnico atualizado!', 'success');
            closeModal('modal-edit-tecnico');
            loadTecnicos();
        } else {
            const err = await res.json();
            Swal.fire('Erro', err.error || 'Falha ao atualizar', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Erro', 'Erro de conexão.', 'error');
    }
}

async function deleteTecnico(id) {
    const result = await Swal.fire({
        title: 'Tem certeza?',
        text: "Esta ação não pode ser revertida e só funcionará se o técnico não tiver estoque!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const res = await apiFetch(`${API_URL}/tecnicos/${id}`, { method: 'DELETE' });
            if (res.ok) {
                Swal.fire('Deletado!', 'Técnico excluído com sucesso.', 'success');
                loadTecnicos();
            } else {
                const err = await res.json();
                Swal.fire('Erro', err.error || 'Falha ao excluir. Verifique se há equipamentos vinculados.', 'error');
            }
        } catch (e) {
            console.error(e);
            Swal.fire('Erro', 'Erro de conexão.', 'error');
        }
    }
}

// === DISTRIBUIÇÃO ===
async function loadDistribuicao() {
    try {
        // History
        const rHist = await apiFetch(`${API_URL}/distribuicoes`);
        const hData = await rHist.json();
        const tbody = document.getElementById('tbody-distribuicoes');
        tbody.innerHTML = '';
        hData.forEach(d => {
            const dt = new Date(d.data_distribuicao).toLocaleDateString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            tbody.innerHTML += `<tr><td>${dt}</td><td>${d.num_interno}</td><td>${d.serial}</td><td><span class="status-badge estoque">${d.tecnico_nome}</span></td></tr>`;
        });

        // Individual Selects Load
        await loadDistribuicaoSelectors();
    } catch(e) { console.error(e); }
}

let distribuicaoTeckList = [];
let distribuicaoEqList = [];

async function loadDistribuicaoSelectors() {
    const rTec = await apiFetch(`${API_URL}/tecnicos`);
    distribuicaoTeckList = await rTec.json();
    
    const rEq = await apiFetch(`${API_URL}/equipamentos`);
    distribuicaoEqList = await rEq.json();
    
    // Populate Origem
    const oSel = document.getElementById('dist-individual-origem');
    const oldOrigemVal = oSel.value; // Store to retain selection if reloaded
    oSel.innerHTML = '<option value="base">Base (Estoque Principal - Disponível)</option>';
    distribuicaoTeckList.forEach(t => {
        oSel.innerHTML += `<option value="tec-${t.id}">Técnico: ${t.nome}</option>`;
    });
    // Attempt to retain previous state if it exists
    if(oldOrigemVal) oSel.value = oldOrigemVal;
    
    // Automatically reset internal values just in case it got broken
    if (!oSel.value) oSel.value = 'base';

    loadDistribuicaoEquipamentos();
}

function loadDistribuicaoEquipamentos() {
    const oSelVal = document.getElementById('dist-individual-origem').value;
    const eqSel = document.getElementById('dist-individual-eq');
    eqSel.innerHTML = '';
    
    let filteredEqs = [];
    if (oSelVal === 'base') {
        filteredEqs = distribuicaoEqList.filter(e => e.status === 'Disponível');
    } else if (oSelVal && oSelVal.startsWith('tec-')) {
        const id = oSelVal.split('-')[1];
        filteredEqs = distribuicaoEqList.filter(e => e.status === 'Em Estoque Técnico' && String(e.tecnico_id) === String(id));
    }
    
    filteredEqs.forEach(e => eqSel.innerHTML += `<option value="${e.id}">[${e.num_interno}] - ${e.serial}</option>`);
    loadDistribuicaoDestinos();
}

function loadDistribuicaoDestinos() {
    const oSelVal = document.getElementById('dist-individual-origem').value;
    const tSel = document.getElementById('dist-individual-tec');
    tSel.innerHTML = '';
    
    if (oSelVal !== 'base') {
        tSel.innerHTML += '<option value="base">--- Devolver para a Base ---</option>';
    }
    
    distribuicaoTeckList.forEach(t => {
        if (oSelVal !== `tec-${t.id}`) {
            tSel.innerHTML += `<option value="${t.id}">${t.nome}</option>`;
        }
    });
}

async function salvarDistribuicaoIndividual() {
    const eqSelect = document.getElementById('dist-individual-eq');
    const selectedOptions = Array.from(eqSelect.selectedOptions);
    const eqIds = selectedOptions.map(opt => opt.value).filter(val => val !== "");

    const destId = document.getElementById('dist-individual-tec').value;
    if(eqIds.length === 0 || !destId) return Swal.fire('Atenção', 'Selecione os Equipamentos e o Destino!', 'warning');
    
    try {
        const payload = destId === 'base' 
            ? { ids: eqIds, action: 'devolve' } 
            : { ids: eqIds, action: 'assign', tecnico_id: destId };

        const res = await apiFetch(`${API_URL}/equipamentos/move`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if(res.ok) {
            Swal.fire('Sucesso', `Movimentação processada: ${eqIds.length} unidade(s)!`, 'success');
            loadDistribuicao();
        } else {
            const err = await res.json();
            Swal.fire('Erro', err.error || err.message || 'Falha ao processar movimentação.', 'error');
        }
    } catch(e) { console.error(e); }
}

async function handleAssignUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet);
        
        // Fetch equipments and tech arrays map
        const resEq = await apiFetch(`${API_URL}/equipamentos`);
        const eqsInfo = await resEq.json();
        const eqMap = {}; 
        eqsInfo.forEach(eq => {
            if(eq.status === 'Disponível') { 
                eqMap[eq.serial.trim()] = eq.id;
                eqMap[eq.num_interno.trim()] = eq.id;
            }
        });
        
        const resTec = await apiFetch(`${API_URL}/tecnicos`);
        const tecsInfo = await resTec.json();
        const tecMap = {};
        tecsInfo.forEach(t => {
            tecMap[t.id.toString()] = t.id;
            tecMap[t.nome.trim().toLowerCase()] = t.id;
        });

        const assignments = {}; // tecId -> [eqId1, eqId2]
        
        json.forEach(row => {
            const tecIdRaw = row['nome_tecnico'] || row['Nome Tecnico'] || row['id_tecnico'] || row['ID'] || row['Técnico ID'] || String(Object.values(row)[1] || '');
            const eqRaw = row['numero_interno'] || row['Num Interno'] || row['num_interno'] || row['Serial'] || row['serial'] || String(Object.values(row)[0] || '');
            
            const tecId = tecMap[String(tecIdRaw).trim().toLowerCase()];
            const eqId = eqMap[String(eqRaw).trim()];
            
            if (tecId && eqId) {
                if(!assignments[tecId]) assignments[tecId] = [];
                assignments[tecId].push(eqId);
            }
        });
        
        let count = 0;
        for (const tecId in assignments) {
            const ids = assignments[tecId];
            if(ids.length > 0) {
                await apiFetch(`${API_URL}/equipamentos/assign`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ids: ids, tecnico_id: tecId })
                });
                count += ids.length;
            }
        }
        
        if (count > 0) Swal.fire('Sucesso', `${count} equipamentos distribuídos a técnicos!`, 'success');
        else Swal.fire('Atenção', 'Nenhum equipamento distribuído (podem não estar Disponíveis, ou nome/serial não bateram).', 'warning');
        
        event.target.value = ''; // Reset
        loadDistribuicao();
    };
    reader.readAsArrayBuffer(file);
}

function abrirNovoServicoParaTecnico() {
    closeModal('modal-ver-estoque');
    document.querySelector('[data-target="servicos"]').click();
    setTimeout(() => {
        openModal('modal-add-servico');
        setTimeout(() => {
            document.getElementById('sel-tecnico').value = tecIdForServico;
            loadTecnicoInventory(); // trigger cascaded inventory load
        }, 200);
    }, 100);
}

async function handleServicosUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet);
        
        const payloads = json.map(row => {
            return {
                serial: row['serial'] || row['Serial'] || String(Object.values(row)[0] || ''),
                tipo_servico: row['tipo_servico'] || row['Tipo de Serviço'] || row['Tipo Servico'] || row['tipo'] || String(Object.values(row)[1] || ''),
                data: row['data'] || row['Data'] || '', // backend falls back to today
                placa_obs: row['placa_obs'] || row['placa'] || row['obs'] || row['Placa/Obs'] || row['PLACA'] || ''
            };
        }).filter(x => String(x.serial).trim() !== '' && String(x.tipo_servico).trim() !== '' && String(x.serial).trim() !== 'undefined');
        
        if (payloads.length === 0) return Swal.fire('Atenção', 'Nenhum dado com "serial" e "tipo_servico" válido encontrado!', 'warning');
        
        try {
            const res = await apiFetch(`${API_URL}/servicos/bulk`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payloads)
            });
            const out = await res.json();
            if (res.ok) {
                if(out.count > 0) Swal.fire('Sucesso', `${out.count} serviços registrados com dedução automática.`, 'success');
                else Swal.fire('Atenção', 'Nenhum serial da planilha consta no estoque dos técnicos no momento.', 'warning');
                loadServicos();
            } else Swal.fire('Erro', out.error || 'Erro inesperado.', 'error');
        } catch(err) { console.error(err); }
        
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}
// === SERVIÇOS E RECOLHIMENTO ===
async function recolherEquipamentoManual() {
    const serial = document.getElementById('recolher-serial-manual').value.trim();
    if(!serial) return Swal.fire('Atenção', 'Digite um Serial!', 'warning');
    
    try {
        const res = await apiFetch(`${API_URL}/equipamentos/recolher`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify([{ serial }])
        });
        
        const out = await res.json();
        if (res.ok) {
            if (out.changes > 0) {
                Swal.fire('Sucesso', `Equipamento recolhido para a Base com sucesso!`, 'success');
                document.getElementById('recolher-serial-manual').value = '';
            } else {
                Swal.fire('Atenção', 'Equipamento não encontrado ou não está como Instalado!', 'info');
            }
        } else {
            Swal.fire('Erro', 'Ocorreu um erro ao recolher.', 'error');
        }
    } catch (e) { console.error(e); }
}

async function handleRecolherUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        const payloads = json.map(row => {
            return {
                serial: row['serial'] || row['Serial'] || row['SERIAL'] || String(Object.values(row)[0] || '')
            };
        }).filter(x => x.serial.trim() !== '' && typeof x.serial.trim !== 'undefined');
        
        if (payloads.length === 0) return Swal.fire('Atenção', 'Nenhum serial válido encontrado!', 'warning');
        
        try {
            const res = await apiFetch(`${API_URL}/equipamentos/recolher`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payloads)
            });
            const out = await res.json();
            if (res.ok) {
                if(out.changes > 0) Swal.fire('Sucesso', `${out.changes} equipamentos retornados à Base com sucesso.`, 'success');
                else Swal.fire('Atenção', 'Nenhum serial correspondia a equipamentos "Instalado".', 'warning');
            } else Swal.fire('Erro', out.error || 'Erro inesperado.', 'error');
        } catch(err) { console.error(err); }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

async function loadServicos() {
    try {
        const res = await apiFetch(`${API_URL}/servicos`);
        const data = await res.json();
        const tbody = document.getElementById('tbody-servicos');
        tbody.innerHTML = '';
        data.forEach(s => {
            const date = new Date(s.data).toLocaleDateString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            tbody.innerHTML += `
                <tr>
                    <td>${date}</td>
                    <td><strong>${s.tecnico_nome}</strong></td>
                    <td>${s.num_interno}</td>
                    <td>${s.serial}</td>
                    <td><span class="service-badge">${s.tipo_servico}</span></td>
                    <td><span style="color:var(--text-muted); font-size:0.85rem">${s.placa_obs || '-'}</span></td>
                </tr>
            `;
        });
    } catch(e) { console.error(e); }
}

async function loadServiceFormData() {
    // Load Tecnicos Dropdown
    const tRes = await apiFetch(`${API_URL}/tecnicos`);
    const ts = await tRes.json();
    const tSel = document.getElementById('sel-tecnico');
    tSel.innerHTML = '<option value="">Selecione...</option>';
    ts.forEach(t => tSel.innerHTML += `<option value="${t.id}">${t.nome}</option>`);

    // Load Tipos
    const cRes = await apiFetch(`${API_URL}/configuracoes`);
    const confs = await cRes.json();
    const tServ = confs.find(c => c.chave === 'tipos_servico');
    const sSel = document.getElementById('sel-tipo-servico');
    sSel.innerHTML = '';
    if(tServ) {
        JSON.parse(tServ.valor).forEach(t => sSel.innerHTML += `<option value="${t}">${t}</option>`);
    }
}

async function loadTecnicoInventory() {
    const tecId = document.getElementById('sel-tecnico').value;
    if(!tecId) return;
    
    const eRes = await apiFetch(`${API_URL}/equipamentos`);
    const eqs = await eRes.json();
    
    // Filter equipments Em Estoque for this Technician
    const myEqs = eqs.filter(e => String(e.tecnico_id) === String(tecId) && e.status === 'Em Estoque Técnico');
    
    const eqSel = document.getElementById('sel-equipamento');
    eqSel.innerHTML = '<option value="">Selecione Equipamento...</option>';
    myEqs.forEach(eq => eqSel.innerHTML += `<option value="${eq.id}">[${eq.num_interno}] - ${eq.serial}</option>`);
}

function filterDistEquipamentos() {
    const q = document.getElementById('filter-dist-eq').value.toLowerCase();
    const sel = document.getElementById('dist-individual-eq');
    Array.from(sel.options).forEach(opt => {
        if(opt.text.toLowerCase().includes(q)) opt.style.display = '';
        else opt.style.display = 'none';
    });
}

function pesquisarServicos() {
    const q = document.getElementById('search-servicos').value.toLowerCase();
    const rows = document.querySelectorAll('#tbody-servicos tr');
    rows.forEach(r => {
        if(r.innerText.toLowerCase().includes(q)) r.style.display = '';
        else r.style.display = 'none';
    });
}

function downloadTemplateRemocao() {
    const ws = XLSX.utils.json_to_sheet([{serial: ''}]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Remocao");
    XLSX.writeFile(wb, "template_remocao_massa.xlsx");
}

async function saveServico() {
    const tId = document.getElementById('sel-tecnico').value;
    const eId = document.getElementById('sel-equipamento').value;
    const sType = document.getElementById('sel-tipo-servico').value;
    const placa_obs = document.getElementById('sel-placa-obs').value;
    
    if(!tId || !eId || !sType) return Swal.fire('Atenção', 'Selecione as opções!', 'warning');
    
    try {
        const res = await apiFetch(`${API_URL}/servicos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ equipamento_id: eId, tecnico_id: tId, tipo_servico: sType, placa_obs })
        });
        
        if(res.ok) {
            Swal.fire('Sucesso', 'Serviço salvo e equipamento Instalado!', 'success');
            document.getElementById('sel-placa-obs').value = '';
            closeModal('modal-add-servico');
            loadServicos();
        }
    } catch(e) { console.error(e); }
}

// === CONFIGURAÇÕES ===
let globalConfigId = null;
let tiposArray = [];
let modelosArray = [];

async function loadConfiguracoes() {
    const cRes = await apiFetch(`${API_URL}/configuracoes`);
    const confs = await cRes.json();
    const tServ = confs.find(c => c.chave === 'tipos_servico');
    const tMod = confs.find(c => c.chave === 'modelos_equipamento');
    
    if (tServ) {
        tiposArray = JSON.parse(tServ.valor);
        renderTipos();
    }
    
    if (tMod) {
        modelosArray = JSON.parse(tMod.valor);
        renderModelos();
    }
}

function renderTipos() {
    const container = document.getElementById('container-tipos-servico');
    if(!container) return;
    container.innerHTML = '';
    tiposArray.forEach((t, i) => {
        container.innerHTML += `<div class="service-badge">${t} <i class="fa-solid fa-xmark" style="cursor:pointer;" onclick="removerTipo(${i})"></i></div>`;
    });
}

function renderModelos() {
    const container = document.getElementById('container-modelos-equip');
    const selModelo = document.getElementById('eq-modelo');
    if(container) container.innerHTML = '';
    if(selModelo) selModelo.innerHTML = '<option value="">-- Indefinido --</option>';
    
    modelosArray.forEach((t, i) => {
        if(container) container.innerHTML += `<div class="service-badge" style="background:#f3f4f6; color:#333; border:1px solid #ccc;">${t} <i class="fa-solid fa-xmark" style="cursor:pointer; color:#ef4444;" onclick="removerModeloEquip(${i})"></i></div>`;
        if(selModelo) selModelo.innerHTML += `<option value="${t}">${t}</option>`;
        const selEditModelo = document.getElementById('edit-eq-modelo-list');
        if(selEditModelo) selEditModelo.innerHTML += `<option value="${t}">${t}</option>`;
    });
}

function addTipoServico() {
    const val = document.getElementById('novo-tipo-servico').value;
    if(!val) return;
    tiposArray.push(val);
    document.getElementById('novo-tipo-servico').value = '';
    saveConfigToDB('tipos_servico', tiposArray, renderTipos);
}

function removerTipo(index) {
    tiposArray.splice(index, 1);
    saveConfigToDB('tipos_servico', tiposArray, renderTipos);
}

function addModeloEquip() {
    const val = document.getElementById('novo-modelo-equip').value;
    if(!val) return;
    if(modelosArray.includes(val)) return Swal.fire('Aviso', 'Modelo já existe.', 'warning');
    modelosArray.push(val);
    document.getElementById('novo-modelo-equip').value = '';
    saveConfigToDB('modelos_equipamento', modelosArray, renderModelos);
}

function removerModeloEquip(index) {
    modelosArray.splice(index, 1);
    saveConfigToDB('modelos_equipamento', modelosArray, renderModelos);
}

async function saveConfigToDB(chave, arrayData, renderCallback) {
    await apiFetch(`${API_URL}/configuracoes/${chave}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ valor: JSON.stringify(arrayData) })
    });
    renderCallback();
}

// === RELATÓRIOS ===
async function loadRelatorios() {
    // Populate dropdowns for History filter
    try {
        const rTec = await apiFetch(`${API_URL}/tecnicos`);
        const tecs = await rTec.json();
        const tSel = document.getElementById('rel_srv_tec');
        tSel.innerHTML = '<option value="">-- Todos Técnicos --</option>';
        tecs.forEach(t => tSel.innerHTML += `<option value="${t.id}">${t.nome}</option>`);

        const cRes = await apiFetch(`${API_URL}/configuracoes`);
        const confs = await cRes.json();
        const tServ = confs.find(c => c.chave === 'tipos_servico');
        const sSel = document.getElementById('rel_srv_tipo');
        sSel.innerHTML = '<option value="">-- Todos os Tipos --</option>';
        if(tServ) {
            JSON.parse(tServ.valor).forEach(t => sSel.innerHTML += `<option value="${t}">${t}</option>`);
        }
    } catch(e) { console.error(e); }
}

function processGenericReport(title, headers, rows, isExcel, excelName) {
    if (isExcel) {
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Relatório");
        XLSX.writeFile(wb, `${excelName}_${new Date().getTime()}.xlsx`);
    } else {
        document.getElementById('modal-relatorio-title').innerText = title;
        const thead = document.getElementById('relatorio-generic-head');
        const tbody = document.getElementById('relatorio-generic-body');
        
        thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        tbody.innerHTML = rows.map(r => `<tr>${r.map(c => `<td>${c || '-'}</td>`).join('')}</tr>`).join('');
        
        openModal('modal-ver-relatorio');
    }
}

async function exportFullDatabase() {
    const res = await apiFetch(`${API_URL}/equipamentos`);
    const eqs = await res.json();
    const ws = XLSX.utils.json_to_sheet(eqs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equipamentos_Base_Ativa");
    XLSX.writeFile(wb, `STOKI_Export_Geral_${new Date().getTime()}.xlsx`);
}

async function relatorioEstoque(isExcel) {
    const res = await apiFetch(`${API_URL}/equipamentos`);
    const eqs = await res.json();
    const data = eqs.filter(e => e.status === 'Em Estoque Técnico');
    
    const headers = ['Técnico', 'Nº Interno', 'Serial', 'Data Distribuição'];
    const rows = data.map(e => [
        e.tecnico_nome,
        e.num_interno,
        e.serial,
        e.data_distribuicao ? new Date(e.data_distribuicao).toLocaleDateString() : ''
    ]);
    
    rows.sort((a,b) => String(a[0]).localeCompare(String(b[0])));
    processGenericReport('Estoque Total por Técnico', headers, rows, isExcel, 'Estoque_Tecnicos');
}

async function relatorioInstalados(isExcel) {
    const res = await apiFetch(`${API_URL}/servicos`);
    const srvs = await res.json();
    
    const resEq = await apiFetch(`${API_URL}/equipamentos`);
    const eqs = await resEq.json();
    const instEqs = eqs.filter(e => e.status === 'Instalado');
    
    const srvMap = {};
    srvs.forEach(s => {
        if(!srvMap[s.equipamento_id] || new Date(s.data) > new Date(srvMap[s.equipamento_id].data)) {
            srvMap[s.equipamento_id] = s;
        }
    });

    const headers = ['Técnico Responsável', 'Nº Interno', 'Serial', 'Tipo Serviço', 'Data Instalação'];
    const rows = instEqs.map(e => {
        const sr = srvMap[e.id];
        return [
            sr ? sr.tecnico_nome : '-',
            e.num_interno,
            e.serial,
            sr ? sr.tipo_servico : '-',
            sr ? new Date(sr.data).toLocaleDateString() : '-'
        ];
    });

    rows.sort((a,b) => String(a[0]).localeCompare(String(b[0])));
    processGenericReport('Equipamentos Instalados', headers, rows, isExcel, 'Instalados_Tecnicos');
}

async function relatorioCidades(isExcel) {
    const resTec = await apiFetch(`${API_URL}/tecnicos`);
    const tecnicos = await resTec.json();
    const resEq = await apiFetch(`${API_URL}/equipamentos`);
    const eqs = await resEq.json();
    
    const map = {};
    tecnicos.forEach(t => {
        const key = t.cidade_principal || 'Desconhecida';
        if(!map[key]) map[key] = { cidade: key, t_count: 0, eqs_count: 0, tecs: [] };
        map[key].t_count++;
        map[key].tecs.push(t.nome);
    });
    
    eqs.forEach(e => {
        if (e.status === 'Em Estoque Técnico' && e.tecnico_id) {
            const tec = tecnicos.find(t => String(t.id) === String(e.tecnico_id));
            if(tec) {
                const key = tec.cidade_principal || 'Desconhecida';
                map[key].eqs_count++;
            }
        }
    });

    const headers = ['Cidade Principal', 'Volume de Técnicos', 'Lista de Técnicos', 'Volume Estoque Retido'];
    const rows = Object.values(map).map(m => [
        m.cidade,
        m.t_count,
        m.tecs.join('; '),
        m.eqs_count
    ]);
    
    processGenericReport('Inventário Distribuído por Cidades', headers, rows, isExcel, 'Por_Cidades');
}

async function relatorioSrvHist(isExcel) {
    const dI = document.getElementById('rel_srv_i').value;
    const dF = document.getElementById('rel_srv_f').value;
    const tId = document.getElementById('rel_srv_tec').value;
    const tipo = document.getElementById('rel_srv_tipo').value;

    const res = await apiFetch(`${API_URL}/servicos`);
    const srvs = await res.json();
    
    const filtered = srvs.filter(s => {
        let f1=true, f2=true, f3=true, f4=true;
        if(dI) f1 = new Date(s.data) >= new Date(dI);
        if(dF) f2 = new Date(s.data) <= new Date(dF + 'T23:59:59');
        if(tId) f3 = String(s.tecnico_id) === String(tId);
        if(tipo) f4 = s.tipo_servico === tipo;
        return f1 && f2 && f3 && f4;
    });

    const headers = ['Data', 'Técnico', 'Tipo Serviço', 'Nº Interno', 'Serial'];
    const rows = filtered.map(s => [
        new Date(s.data).toLocaleString(),
        s.tecnico_nome,
        s.tipo_servico,
        s.num_interno,
        s.serial
    ]);
    
    processGenericReport(`Serviços (${filtered.length} reg)`, headers, rows, isExcel, 'Historico_Servicos');
}

// === TEMPLATES / MODELOS ===
function generateExcelTemplate(filename, structData, exampleData) {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(exampleData);
    const ws1cols = Object.keys(exampleData[0] || {}).map(k => ({wch: Math.max(k.length + 5, 20)}));
    ws1['!cols'] = ws1cols;
    XLSX.utils.book_append_sheet(wb, ws1, "1_Planilha_Upload");

    const ws2 = XLSX.utils.aoa_to_sheet(structData);
    ws2['!cols'] = [{wch: 30}, {wch: 70}, {wch: 20}];
    XLSX.utils.book_append_sheet(wb, ws2, "2_Instrucoes_e_Regras");
    
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

function dlTemplateEquip() {
    generateExcelTemplate("Modelo_Equipamentos", [
        ["Nome da Coluna", "Descrição / Regra", "Obrigatório"],
        ["numero_interno", "Tamanho máximo de 5 dígitos (ex: 10452). Apenas números.", "Sim"],
        ["modelo", "Modelo exato do equipamento (ex: GTK LITE 4G). Opcional.", "Não"],
        ["serial", "Endereço físico, MAC ou Serial único do produto.", "Sim"]
    ], [
        { numero_interno: 10543, modelo: "GTK LITE 4G", serial: "AABB112233" },
        { numero_interno: 10544, modelo: "SUNTECH 310U", serial: "AABB112244" }
    ]);
}

function dlTemplateDist() {
    generateExcelTemplate("Modelo_Distribuicao", [
        ["Nome da Coluna", "Descrição / Regra", "Obrigatório"],
        ["numero_interno", "Tamanho máximo de 5 dígitos. Use este ou o serial.", "Não (se usar serial)"],
        ["serial", "Serial único do produto. Use este ou o numero_interno.", "Não (se usar interno)"],
        ["nome_tecnico", "Nome exato (idêntico à base) ou ID numérico do técnico alvo.", "Sim"]
    ], [
        { numero_interno: 10543, serial: "", nome_tecnico: "Paulo Silva" },
        { numero_interno: "", serial: "AABB112244", nome_tecnico: "14" }
    ]);
}

function dlTemplateServ() {
    generateExcelTemplate("Modelo_Servicos", [
        ["Nome da Coluna", "Descrição / Regra", "Obrigatório"],
        ["serial", "Apenas pelo Serial da peça o sistema descobre automaticamente qual técnico estava com a peça e dá baixa.", "Sim"],
        ["tipo_servico", "Exato nome do tipo de serviço (ex: Instalação).", "Sim"],
        ["data", "Data de execução no formato AAAA-MM-DD. Se vazio usa data de hoje.", "Não"]
    ], [
        { serial: "AABB112233", tipo_servico: "Instalação", data: "2026-04-18" },
        { serial: "AABB112244", tipo_servico: "Manutenção", data: "2026-04-18" }
    ]);
}

function dlTemplateTecs() {
    generateExcelTemplate("Modelo_Tecnicos", [
        ["Nome da Coluna", "Descrição / Regra", "Obrigatório"],
        ["nome", "Nome completo ou crachá comercial do analista/técnico.", "Sim"],
        ["cidade_principal", "Cidade base e polo de operação.", "Não"],
        ["sub_cidades", "Lista de outras áreas cobertas, sempre separando com vírgula.", "Não"]
    ], [
        { nome: "João Alves", cidade_principal: "São Paulo", sub_cidades: "Osasco, Guarulhos" },
        { nome: "Pedro Lima", cidade_principal: "Campinas", sub_cidades: "Valinhos, Vinhedo" }
    ]);
}
// === USUÁRIOS (MASTER) ===
async function loadUsuarios() {
    try {
        const res = await apiFetch(`${API_URL}/users`);
        const users = await res.json();
        const tbody = document.getElementById('tbody-usuarios');
        tbody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.email}</td>
                <td><span class="badge ${u.role === 'master' ? 'badge-danger' : 'badge-info'}">${u.role.toUpperCase()}</span></td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="changeUserRole('${u.id}', '${u.role}')" title="Alterar Cargo">
                        <i class="fa-solid fa-user-tag"></i>
                    </button>
                    ${u.email !== localStorage.getItem('stoki_email') ? `
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}')" title="Excluir">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function saveUsuario() {
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-pass').value;
    const role = document.getElementById('user-role').value;

    if (!email || !password) return Swal.fire('Erro', 'Preencha todos os campos', 'error');

    try {
        const res = await apiFetch(`${API_URL}/users`, {
            method: 'POST',
            body: JSON.stringify({ email, password, role })
        });
        if (res.ok) {
            Swal.fire('Sucesso', 'Usuário criado com sucesso!', 'success');
            closeModal('modal-add-usuario');
            loadUsuarios();
        }
    } catch (e) {
        Swal.fire('Erro', e.message, 'error');
    }
}

async function changeUserRole(id, currentRole) {
    const { value: role } = await Swal.fire({
        title: 'Alterar Cargo',
        input: 'select',
        inputOptions: {
            'visualizador': 'Visualizador',
            'operador': 'Operador',
            'gerente': 'Gerente',
            'master': 'Master'
        },
        inputValue: currentRole,
        showCancelButton: true
    });

    if (role) {
        try {
            await apiFetch(`${API_URL}/users/${id}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role })
            });
            loadUsuarios();
            Swal.fire('Atualizado!', 'O cargo foi alterado.', 'success');
        } catch (e) {
            Swal.fire('Erro', e.message, 'error');
        }
    }
}

async function deleteUser(id) {
    const result = await Swal.fire({
        title: 'Tem certeza?',
        text: "O acesso deste usuário será revogado!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sim, excluir!'
    });

    if (result.isConfirmed) {
        try {
            await apiFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
            loadUsuarios();
            Swal.fire('Excluído!', 'O usuário foi removido.', 'success');
        } catch (e) {
            Swal.fire('Erro', e.message, 'error');
        }
    }
}

// === LOGS (MASTER/GERENTE) ===
async function loadLogs() {
    try {
        const res = await apiFetch(`${API_URL}/audit`);
        const logs = await res.json();
        const tbody = document.getElementById('tbody-logs');
        tbody.innerHTML = '';

        logs.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-size:0.75rem">${new Date(l.created_at).toLocaleString()}</td>
                <td>${l.user_email}</td>
                <td><span class="badge badge-info">${l.acao}</span></td>
                <td>${l.tabela_alvo}</td>
                <td>${l.item_id || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick='viewLogDetail(${JSON.stringify(l)})'>
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

function viewLogDetail(log) {
    Swal.fire({
        title: `Detalhes: ${log.acao}`,
        html: `
            <div style="text-align:left; font-size:0.85rem;">
                <p><strong>Tabela:</strong> ${log.tabela_alvo}</p>
                <p><strong>ID Item:</strong> ${log.item_id}</p>
                <hr>
                <p><strong>Dados Anteriores:</strong></p>
                <pre style="background:#f4f4f4; padding:5px;">${JSON.stringify(log.dados_antigos, null, 2)}</pre>
                <p><strong>Dados Novos:</strong></p>
                <pre style="background:#f4f4f4; padding:5px;">${JSON.stringify(log.dados_novos, null, 2)}</pre>
            </div>
        `,
        width: '600px'
    });
}
