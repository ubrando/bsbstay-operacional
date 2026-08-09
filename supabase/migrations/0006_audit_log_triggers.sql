-- ============================================================
-- Histórico de mudanças em tarefas e unidades, via audit_log (existia no
-- schema desde 0001_init.sql, nunca foi preenchida por código nenhum).
-- Feito via trigger, não logado manualmente em cada tela — a mudança de
-- status de tarefa acontece em vários lugares (Kanban, detalhe, Minhas
-- Tarefas) e um trigger garante que nada escapa, mesmo que uma tela nova
-- no futuro esqueça de logar.
-- ============================================================

-- tarefas: status mudou (AFTER UPDATE)
CREATE OR REPLACE FUNCTION public.log_tarefa_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_log (user_id, acao, tabela, registro_id, detalhes)
    VALUES (auth.uid(), 'status_change', 'tarefas', NEW.id, jsonb_build_object('de', OLD.status, 'para', NEW.status));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_tarefas_audit_status
  AFTER UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.log_tarefa_status_change();

-- tarefas: excluída (AFTER DELETE) — depois do cascade a linha original
-- some (tempo_registros, tarefa_camareiras, vistoria_demandas), então o
-- audit_log é o único rastro que sobra. Resumo mínimo pra ainda fazer
-- sentido sem a linha original.
CREATE OR REPLACE FUNCTION public.log_tarefa_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, acao, tabela, registro_id, detalhes)
  VALUES (
    auth.uid(), 'excluida', 'tarefas', OLD.id,
    jsonb_build_object('tipo', OLD.tipo, 'unidade_id', OLD.unidade_id, 'data_prevista', OLD.data_prevista)
  );
  RETURN OLD;
END; $$;

CREATE TRIGGER trg_tarefas_audit_delete
  AFTER DELETE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.log_tarefa_delete();

-- unidades: campos relevantes mudaram (AFTER UPDATE) — detalhes só com o
-- que de fato mudou ({campo: {de, para}}), não o registro inteiro.
CREATE OR REPLACE FUNCTION public.log_unidade_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mudancas JSONB := '{}'::jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    mudancas := mudancas || jsonb_build_object('status', jsonb_build_object('de', OLD.status, 'para', NEW.status));
  END IF;
  IF OLD.nome IS DISTINCT FROM NEW.nome THEN
    mudancas := mudancas || jsonb_build_object('nome', jsonb_build_object('de', OLD.nome, 'para', NEW.nome));
  END IF;
  IF OLD.endereco IS DISTINCT FROM NEW.endereco THEN
    mudancas := mudancas || jsonb_build_object('endereco', jsonb_build_object('de', OLD.endereco, 'para', NEW.endereco));
  END IF;
  IF OLD.tempo_limpeza_min IS DISTINCT FROM NEW.tempo_limpeza_min THEN
    mudancas := mudancas || jsonb_build_object('tempo_limpeza_min', jsonb_build_object('de', OLD.tempo_limpeza_min, 'para', NEW.tempo_limpeza_min));
  END IF;
  IF OLD.ativo IS DISTINCT FROM NEW.ativo THEN
    mudancas := mudancas || jsonb_build_object('ativo', jsonb_build_object('de', OLD.ativo, 'para', NEW.ativo));
  END IF;
  IF OLD.capacidade IS DISTINCT FROM NEW.capacidade THEN
    mudancas := mudancas || jsonb_build_object('capacidade', jsonb_build_object('de', OLD.capacidade, 'para', NEW.capacidade));
  END IF;

  IF mudancas <> '{}'::jsonb THEN
    INSERT INTO public.audit_log (user_id, acao, tabela, registro_id, detalhes)
    VALUES (auth.uid(), 'atualizada', 'unidades', NEW.id, mudancas);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_unidades_audit_update
  AFTER UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.log_unidade_update();

-- manager acompanha a operação (já vê Alertas e Métricas) — faz sentido
-- ver o histórico de auditoria também. Não dá pra ALTER POLICY a USING,
-- então recria (mesmo efeito de um CREATE OR REPLACE).
DROP POLICY IF EXISTS "ver_audit_log" ON public.audit_log;
CREATE POLICY "ver_audit_log" ON public.audit_log FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin','manager']::app_role[]));
