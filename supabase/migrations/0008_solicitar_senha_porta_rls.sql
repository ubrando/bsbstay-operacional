-- ============================================================
-- Camareiras e vistoriadores executam as tarefas e são quem de fato esbarra
-- na falta de senha da porta — mas "criar_solicitacoes" só permitia
-- operacional/atendimento/super_admin. Amplia só para tipo='senha_porta',
-- sem tocar nos outros tipos de solicitação (pedidos do hóspede continuam
-- restritos a quem atende o hóspede).
--
-- Precisa ser uma migration separada da que adiciona 'senha_porta' ao enum
-- solicitacao_tipo (0007): Postgres não permite usar um valor de enum recém
-- criado por ALTER TYPE ... ADD VALUE na mesma transação em que foi criado.
-- ============================================================

DROP POLICY IF EXISTS "criar_solicitacoes" ON public.solicitacoes;
CREATE POLICY "criar_solicitacoes" ON public.solicitacoes FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[])
    OR (tipo = 'senha_porta' AND public.has_any_role(auth.uid(), ARRAY['camareira','vistoriador']::app_role[]))
  );
