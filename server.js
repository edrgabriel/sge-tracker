const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==== API ROUTES ====

// -- Equipamentos --
app.get('/api/equipamentos', (req, res) => {
    const query = `
        SELECT e.*, t.nome as tecnico_nome 
        FROM equipamentos e 
        LEFT JOIN tecnicos t ON e.tecnico_id = t.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/equipamentos', (req, res) => {
    const { num_interno, serial, status, tecnico_id, modelo } = req.body;
    db.run(
        "INSERT INTO equipamentos (num_interno, serial, status, tecnico_id, modelo) VALUES (?, ?, ?, ?, ?)",
        [num_interno, serial, status || 'Disponível', tecnico_id || null, modelo || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.post('/api/equipamentos/bulk', (req, res) => {
    const equipamentos = req.body; 
    const stmt = db.prepare("INSERT OR REPLACE INTO equipamentos (num_interno, serial, status, tecnico_id, modelo) VALUES (?, ?, ?, NULL, ?)");
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        equipamentos.forEach(eq => {
            stmt.run([eq.num_interno, eq.serial, 'Disponível', eq.modelo || null]);
        });
        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, count: equipamentos.length });
        });
    });
    stmt.finalize();
});

// Update Status/Assign to technician
app.put('/api/equipamentos/:id', (req, res) => {
    const id = req.params.id;
    const { status, tecnico_id } = req.body;
    
    let query = "UPDATE equipamentos SET status = ?";
    let params = [status];
    
    if (tecnico_id !== undefined) {
        query += ", tecnico_id = ?";
        params.push(tecnico_id);
    }
    
    // Config current date if status goes to Em Estoque
    if (status === 'Em Estoque Técnico' && tecnico_id) {
        query += ", data_distribuicao = ?";
        params.push(new Date().toISOString());
    }
    
    query += " WHERE id = ?";
    params.push(id);
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Bulk assign to technician (Legacy for excel upload)
app.post('/api/equipamentos/assign', (req, res) => {
    const { ids, tecnico_id } = req.body;
    if (!ids || !ids.length || !tecnico_id) return res.status(400).json({ error: "Missing data" });

    const placeholders = ids.map(() => '?').join(',');
    const today = new Date().toISOString();
    const query = `UPDATE equipamentos SET status = 'Em Estoque Técnico', tecnico_id = ?, data_distribuicao = ? WHERE id IN (${placeholders})`;
    
    db.run(query, [tecnico_id, today, ...ids], function(err) {
        if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, changes: this.changes });
    });
});

// Dynamic Movement for Individual Assignment (Assign, Transfer, Devolve)
app.post('/api/equipamentos/move', (req, res) => {
    const { ids, action, tecnico_id } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: "Missing ids" });

    const placeholders = ids.map(() => '?').join(',');
    const today = new Date().toISOString();
    
    let query = '';
    let params = [];
    
    if (action === 'devolve') {
        query = `UPDATE equipamentos SET status = 'Disponível', tecnico_id = NULL, data_distribuicao = NULL WHERE id IN (${placeholders})`;
        params = [...ids];
    } else if (action === 'assign' || action === 'transfer') {
        if (!tecnico_id) return res.status(400).json({ error: "Missing Target Technician ID" });
        query = `UPDATE equipamentos SET status = 'Em Estoque Técnico', tecnico_id = ?, data_distribuicao = ? WHERE id IN (${placeholders})`;
        params = [tecnico_id, today, ...ids];
    } else {
        return res.status(400).json({ error: "Invalid action" });
    }
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});


// History of distributions
app.get('/api/distribuicoes', (req, res) => {
    const query = `
        SELECT e.num_interno, e.serial, e.data_distribuicao, t.nome as tecnico_nome 
        FROM equipamentos e
        JOIN tecnicos t ON e.tecnico_id = t.id
        WHERE e.status = 'Em Estoque Técnico' AND e.data_distribuicao IS NOT NULL
        ORDER BY e.data_distribuicao DESC LIMIT 20
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// -- Tecnicos --
app.get('/api/tecnicos', (req, res) => {
    const query = `
        SELECT t.*, COUNT(e.id) as qtd_estoque
        FROM tecnicos t
        LEFT JOIN equipamentos e ON e.tecnico_id = t.id AND e.status = 'Em Estoque Técnico'
        GROUP BY t.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tecnicos', (req, res) => {
    const { nome, cidade_principal, sub_cidades } = req.body;
    db.run(
        "INSERT INTO tecnicos (nome, cidade_principal, sub_cidades) VALUES (?, ?, ?)",
        [nome, cidade_principal, sub_cidades],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// -- Servicos --
app.get('/api/servicos', (req, res) => {
    const query = `
        SELECT s.*, e.num_interno, e.serial, t.nome as tecnico_nome 
        FROM servicos s
        JOIN equipamentos e ON s.equipamento_id = e.id
        JOIN tecnicos t ON s.tecnico_id = t.id
        ORDER BY s.data DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/servicos', (req, res) => {
    const { equipamento_id, tecnico_id, tipo_servico, data: clientData, placa_obs } = req.body;
    const data = clientData || new Date().toISOString();
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("UPDATE equipamentos SET status = 'Instalado' WHERE id = ?", [equipamento_id]);
        db.run(
            "INSERT INTO servicos (equipamento_id, tecnico_id, tipo_servico, data, placa_obs) VALUES (?, ?, ?, ?, ?)",
            [equipamento_id, tecnico_id, tipo_servico, data, placa_obs || '']
        );
        db.run("COMMIT", function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: "Serviço registrado com sucesso." });
        });
    });
});

app.post('/api/servicos/bulk', (req, res) => {
    const payloads = req.body; // array of { serial, tipo_servico, data, placa_obs }
    const today = new Date().toISOString();
    let successCount = 0;
    
    db.all("SELECT id, tecnico_id, serial FROM equipamentos WHERE status = 'Em Estoque Técnico'", [], (err, eqs) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const eqMap = {};
        eqs.forEach(eq => eqMap[String(eq.serial).trim()] = eq);

        const validSrv = payloads.map(p => {
            const match = eqMap[String(p.serial).trim()];
            if(match && p.tipo_servico) {
                return {
                    eq_id: match.id,
                    tec_id: match.tecnico_id,
                    tipo: p.tipo_servico,
                    data_srv: p.data || today,
                    placa: p.placa_obs || ''
                };
            }
            return null;
        }).filter(x => x !== null);

        if(validSrv.length === 0) return res.json({ success: true, count: 0 });

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmtEq = db.prepare("UPDATE equipamentos SET status = 'Instalado' WHERE id = ?");
            const stmtSrv = db.prepare("INSERT INTO servicos (equipamento_id, tecnico_id, tipo_servico, data, placa_obs) VALUES (?, ?, ?, ?, ?)");
            
            validSrv.forEach(s => {
                stmtEq.run([s.eq_id]);
                stmtSrv.run([s.eq_id, s.tec_id, s.tipo, s.data_srv, s.placa]);
                successCount++;
            });
            
            db.run("COMMIT", (err) => {
                if (err) return res.status(500).json({ error: err.message });
                stmtEq.finalize();
                stmtSrv.finalize();
                res.json({ success: true, count: successCount });
            });
        });
    });
});

// Recolher equipamentos instalados de volta para base
app.post('/api/equipamentos/recolher', (req, res) => {
    const payloads = req.body; // array of { serial, placa_obs } or strings
    if (!payloads || !payloads.length) return res.status(400).json({ error: "Missing data" });

    const paramsArray = payloads.map(p => {
        if (typeof p === 'string') return { serial: p, placa_obs: '' };
        return { serial: p.serial, placa_obs: p.placa_obs || p.placa || p.obs || '' };
    }).filter(x => x.serial);

    if (paramsArray.length === 0) return res.json({ success: true, changes: 0 });

    const serials = paramsArray.map(p => p.serial);
    const placeholders = serials.map(() => '?').join(',');

    db.all(`SELECT id, tecnico_id, serial FROM equipamentos WHERE status = 'Instalado' AND serial IN (${placeholders})`, serials, (err, eqs) => {
        if (err) return res.status(500).json({ error: err.message });
        if (eqs.length === 0) return res.json({ success: true, changes: 0 });

        const serialMap = {};
        paramsArray.forEach(p => serialMap[p.serial] = p.placa_obs);

        const today = new Date().toISOString();
        let successCount = 0;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmtEq = db.prepare("UPDATE equipamentos SET status = 'Disponível', tecnico_id = NULL, data_distribuicao = NULL WHERE id = ?");
            // Register movement inside history! Attributed to the old technician
            const stmtSrv = db.prepare("INSERT INTO servicos (equipamento_id, tecnico_id, tipo_servico, data, placa_obs) VALUES (?, ?, 'Desinstalação / Recolhimento', ?, ?)");

            eqs.forEach(eq => {
                stmtEq.run([eq.id]);
                stmtSrv.run([eq.id, eq.tecnico_id, today, serialMap[eq.serial] || '-']);
                successCount++;
            });

            db.run("COMMIT", (err) => {
                if (err) return res.status(500).json({ error: err.message });
                stmtEq.finalize();
                stmtSrv.finalize();
                res.json({ success: true, changes: successCount });
            });
        });
    });
});

// -- Configuracoes --
app.get('/api/configuracoes', (req, res) => {
    db.all("SELECT * FROM configuracoes", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/configuracoes/:chave', (req, res) => {
    const { valor } = req.body;
    db.run(
        "UPDATE configuracoes SET valor = ? WHERE chave = ?",
        [valor, req.params.chave],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Dashboard stats
app.get('/api/stats', (req, res) => {
    const stats = {};
    db.serialize(() => {
        db.get("SELECT COUNT(*) as total FROM equipamentos", (err, row) => stats.totalEq = row ? row.total : 0);
        db.get("SELECT COUNT(*) as disp FROM equipamentos WHERE status = 'Disponível'", (err, row) => stats.dispEq = row ? row.disp : 0);
        db.get("SELECT COUNT(*) as tech FROM equipamentos WHERE status = 'Em Estoque Técnico'", (err, row) => stats.techEq = row ? row.tech : 0);
        db.get("SELECT COUNT(*) as inst FROM equipamentos WHERE status = 'Instalado'", (err, row) => {
            stats.instEq = row ? row.inst : 0;
            
            // Top 5 and Chart Data for technicians
            db.all("SELECT t.nome as tecnico_nome, COUNT(e.id) as count FROM equipamentos e JOIN tecnicos t ON e.tecnico_id = t.id WHERE e.status = 'Em Estoque Técnico' GROUP BY t.id ORDER BY count DESC", [], (err, rows) => {
                stats.chart_techs = rows || [];
                stats.top_techs = (rows || []).slice(0, 5);
                
                // Last 10 Services
                db.all("SELECT s.data, s.tipo_servico, e.serial, t.nome as tecnico_nome FROM servicos s JOIN equipamentos e ON s.equipamento_id = e.id JOIN tecnicos t ON s.tecnico_id = t.id ORDER BY s.data DESC LIMIT 10", [], (err, srvs) => {
                    stats.last_services = srvs || [];
                    res.json(stats);
                });
            });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`STOKI Server running at http://localhost:${PORT}`);
});
