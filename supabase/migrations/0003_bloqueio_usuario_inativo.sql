-- ============================================================
-- Correção de segurança: desativar um usuário (profiles.ativo = false)
-- não revogava acesso nenhum — a tela de Gestão de usuários desativava a
-- conta, mas todas as RLS policies continuavam liberando o acesso normal,
-- porque has_role/has_any_role só checavam a role, nunca o profile.
--
-- Como TODA policy sensível do schema (unidades, tarefas, vistoria_demandas,
-- solicitacoes, user_roles, audit_log, etc.) já delega a decisão para
-- has_role/has_any_role, redefinir essas duas functions aqui corrige o
-- acesso em profundidade, sem precisar tocar em cada policy uma por uma.
-- Não edita 0001_init.sql — apenas substitui o corpo via CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = _role AND p.ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = ANY(_roles) AND p.ativo = true
  );
$$;
