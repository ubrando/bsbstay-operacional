-- ============================================================
-- Senha da porta: campo de fallback em unidades + fluxo de solicitação
-- quando nem a tarefa nem a unidade têm senha cadastrada. Reaproveita a
-- infraestrutura de solicitacoes + tela de Alertas (novo tipo de
-- solicitacao) em vez de um sistema de notificação novo.
-- ============================================================

ALTER TABLE public.unidades ADD COLUMN senha_porta TEXT;

-- Não pode ser usado na mesma transação em que é criado, mas essa migration
-- só adiciona o valor — o uso fica pra código/RLS depois, em statements
-- separados.
ALTER TYPE public.solicitacao_tipo ADD VALUE 'senha_porta';
