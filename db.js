const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'stoki.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS equipamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_interno TEXT UNIQUE NOT NULL,
        serial TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'Disponível',
        data_distribuicao TEXT,
        tecnico_id INTEGER,
        FOREIGN KEY(tecnico_id) REFERENCES tecnicos(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tecnicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cidade_principal TEXT NOT NULL,
        sub_cidades TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipamento_id INTEGER,
        tecnico_id INTEGER,
        tipo_servico TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id),
        FOREIGN KEY(tecnico_id) REFERENCES tecnicos(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT UNIQUE NOT NULL,
        valor TEXT NOT NULL
    )`);

    db.get("SELECT COUNT(*) as count FROM configuracoes", (err, row) => {
        if (row.count === 0) {
            const defaultServices = JSON.stringify(['Instalação', 'Manutenção com Troca', 'Troca Preventiva']);
            db.run("INSERT INTO configuracoes (chave, valor) VALUES ('tipos_servico', ?)", [defaultServices]);
        }
    });

    db.get("SELECT COUNT(*) as count FROM configuracoes WHERE chave = 'modelos_equipamento'", (err, row) => {
        if (!row || row.count === 0) {
            const defaultModelos = JSON.stringify(['GTK LITE 4G', 'GTK LW 4G', 'SUNTECH 310U', 'J16']);
            db.run("INSERT INTO configuracoes (chave, valor) VALUES ('modelos_equipamento', ?)", [defaultModelos]);
        }
    });

    // Optionally insert default Technician for demo
    db.get("SELECT COUNT(*) as count FROM tecnicos", (err, row) => {
        if (row.count === 0) {
            db.run("INSERT INTO tecnicos (nome, cidade_principal, sub_cidades) VALUES ('Tecnico Demo', 'São Paulo', 'Osasco, Guarulhos')");
        }
    });

    // Safe Alter Table for runtime schema updates
    db.run("ALTER TABLE equipamentos ADD COLUMN modelo TEXT", (err) => {
        // Will fail cleanly if column already exists
    });

    db.run("ALTER TABLE servicos ADD COLUMN placa_obs TEXT", (err) => {
        // Will fail cleanly if column already exists
    });
});

module.exports = db;
