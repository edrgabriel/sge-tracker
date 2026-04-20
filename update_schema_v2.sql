-- 1. Adicionar colunas extras na tabela de Equipamentos
ALTER TABLE public.equipamentos 
ADD COLUMN IF NOT EXISTS data_retorno TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ultima_placa TEXT;

-- 2. Criar Tabela de Histórico de Movimentações
CREATE TABLE IF NOT EXISTS public.historico_movimentacoes (
    id SERIAL PRIMARY KEY,
    equipamento_id INTEGER REFERENCES public.equipamentos(id) ON DELETE CASCADE,
    data TIMESTAMPTZ DEFAULT NOW(),
    tipo TEXT NOT NULL, -- 'INSTALACAO', 'DEVOLUCAO', 'TRATAMENTO', 'CADASTRADO'
    placa TEXT,
    tecnico_id INTEGER REFERENCES public.tecnicos(id) ON DELETE SET NULL,
    user_email TEXT,
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habilitar RLS e permitir leitura
ALTER TABLE public.historico_movimentacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Histórico acessível por todos" ON public.historico_movimentacoes;
CREATE POLICY "Histórico acessível por todos" ON public.historico_movimentacoes FOR SELECT USING (true);
