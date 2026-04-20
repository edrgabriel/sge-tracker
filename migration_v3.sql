-- 1. Cria a coluna de Lixeira
ALTER TABLE public.equipamentos 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Remove as Constraints Únicas Blindadas (que não ignoram deletados)
ALTER TABLE public.equipamentos DROP CONSTRAINT IF EXISTS equipamentos_serial_key;
ALTER TABLE public.equipamentos DROP CONSTRAINT IF EXISTS equipamentos_num_interno_key;

-- 3. Recria restrições Únicas via Partial Index (ignorando a Lixeira)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS unique_serial_active ON public.equipamentos(serial) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS unique_num_interno_active ON public.equipamentos(num_interno) WHERE deleted_at IS NULL;

-- 4. Função RPC Transacional de Soft Delete
CREATE OR REPLACE FUNCTION public.soft_delete_equipamento(req_id INT, usr_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Atualiza
    UPDATE public.equipamentos 
    SET deleted_at = NOW() 
    WHERE id = req_id;

    -- Tenta inserir o histórico no mesmo pulo (se falhar, o postgres faz rollback)
    INSERT INTO public.historico_movimentacoes (equipamento_id, tipo, user_email, observacao)
    VALUES (req_id, 'equipamento_deletado', usr_email, 'Equipamento deletado do sistema (Soft Delete)');
END;
$$;

-- 5. Função RPC Transacional de Restore Seguro
CREATE OR REPLACE FUNCTION public.restore_equipamento(req_id INT, usr_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_serial TEXT;
    v_conflito INT;
BEGIN
    -- Pega o serial do equipamento guardado na lixeira
    SELECT serial INTO v_serial FROM public.equipamentos WHERE id = req_id;
    
    -- Checa se existe conflito no mundo real ativo
    SELECT id INTO v_conflito FROM public.equipamentos WHERE serial = v_serial AND deleted_at IS NULL LIMIT 1;
    
    IF v_conflito IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um equipamento ativo utilizando este mesmo serial: %', v_serial;
    END IF;

    -- Restaura
    UPDATE public.equipamentos 
    SET deleted_at = NULL 
    WHERE id = req_id;

    -- Tenta inserir o histórico
    INSERT INTO public.historico_movimentacoes (equipamento_id, tipo, user_email, observacao)
    VALUES (req_id, 'equipamento_restaurado', usr_email, 'Equipamento restaurado da lixeira');
END;
$$;
