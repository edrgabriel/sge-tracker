-- Tabela Tecnicos
CREATE TABLE public.tecnicos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    cidade_principal TEXT NOT NULL,
    sub_cidades TEXT
);

-- Tabela Equipamentos
CREATE TABLE public.equipamentos (
    id SERIAL PRIMARY KEY,
    num_interno TEXT UNIQUE NOT NULL,
    serial TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Disponível',
    data_distribuicao TIMESTAMPTZ,
    tecnico_id INTEGER REFERENCES public.tecnicos(id) ON DELETE SET NULL,
    modelo TEXT
);

-- Tabela Servicos
CREATE TABLE public.servicos (
    id SERIAL PRIMARY KEY,
    equipamento_id INTEGER REFERENCES public.equipamentos(id) ON DELETE CASCADE,
    tecnico_id INTEGER REFERENCES public.tecnicos(id) ON DELETE SET NULL,
    tipo_servico TEXT NOT NULL,
    data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    placa_obs TEXT
);

-- Tabela Configuracoes
CREATE TABLE public.configuracoes (
    id SERIAL PRIMARY KEY,
    chave TEXT UNIQUE NOT NULL,
    valor TEXT NOT NULL
);

-- Inserindo Configurações Iniciais Padrão
INSERT INTO public.configuracoes (chave, valor) 
VALUES 
    ('tipos_servico', '["Instalação", "Manutenção com Troca", "Troca Preventiva"]'),
    ('modelos_equipamento', '["GTK LITE 4G", "GTK LW 4G", "SUNTECH 310U", "J16"]')
ON CONFLICT (chave) DO NOTHING;

-- Opcional: Inserir técnico de demonstração
INSERT INTO public.tecnicos (nome, cidade_principal, sub_cidades)
VALUES ('Tecnico Demo', 'São Paulo', 'Osasco, Guarulhos');
