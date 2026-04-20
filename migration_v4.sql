-- 1. Cria ou Atualiza Colunas Extras em Histórico (Preparando "Origem" e "Tipo Original")
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS tipo_original TEXT;
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS origem TEXT;

-- 2. Migração Conservadora e Forense de Históricos Anteriores
UPDATE public.historico_movimentacoes 
SET 
  observacao = observacao || ' (Contexto Histórico: Ocorrência do tipo arcaico ' || tipo || ')',
  tipo_original = tipo,
  tipo = CASE 
           WHEN tipo = 'DEVOLUCAO' THEN 'equipamento_devolvido'
           WHEN tipo = 'TRATAMENTO' THEN 'tratamento_concluido'
         END
WHERE tipo IN ('DEVOLUCAO', 'TRATAMENTO');

-- 3. RPC: Transação de Devolução (Entrada no Funil)
CREATE OR REPLACE FUNCTION public.fluxo_registrar_devolucao(req_id INT, usr_email TEXT, placa_info TEXT, origem_info TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tecnico INT;
BEGIN
    SELECT tecnico_id INTO v_tecnico FROM public.equipamentos WHERE id = req_id AND deleted_at IS NULL;
    
    UPDATE public.equipamentos 
    SET 
        status = 'Pendente', 
        id_tecnico_anterior = v_tecnico,
        tecnico_id = NULL,
        data_distribuicao = NULL,
        data_retorno = NOW(),
        ultima_placa = COALESCE(placa_info, '-')
    WHERE id = req_id AND deleted_at IS NULL;

    INSERT INTO public.historico_movimentacoes (equipamento_id, tipo, placa, user_email, observacao, origem)
    VALUES (req_id, 'equipamento_devolvido', placa_info, usr_email, 'Equipamento devolvido / desinstalado. Entrado em status Pendente.', origem_info);
END;
$$;

-- 4. RPC: Transação Final de Tratamento (Validação Forte)
CREATE OR REPLACE FUNCTION public.fluxo_finalizar_tratamento(req_id INT, usr_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM public.equipamentos WHERE id = req_id AND deleted_at IS NULL;
    
    IF v_status != 'Pendente' THEN
        RAISE EXCEPTION 'Ação Negada (Anti-Bypass). O equipamento não está Pendente (encontra-se como %). O tratamento só finaliza aquilo que passou pela Devolução legítima.', v_status;
    END IF;

    UPDATE public.equipamentos 
    SET 
        status = 'Disponível',
        data_retorno = NULL,
        ultima_placa = NULL
    WHERE id = req_id AND deleted_at IS NULL;

    INSERT INTO public.historico_movimentacoes (equipamento_id, tipo, user_email, observacao, origem)
    VALUES (req_id, 'tratamento_concluido', usr_email, 'Tratamento concluído via Central. Equipamento limpo e Disponível para reuso.', 'acao_manual');
END;
$$;
