-- ============================================================
-- Suporte à tela de Gestão de usuários (src/routes/app.usuarios.tsx)
-- Só ADICIONA (função nova + policy nova) — nada em 0001 é alterado.
-- ============================================================

-- auth.users não é exposto via PostgREST, então o cliente não consegue
-- ler e-mail diretamente. Esta função SECURITY DEFINER expõe user_id+email
-- só para quem já tem papel de admin do Operacional; para qualquer outro
-- chamador (ou anônimo) o WHERE reduz o resultado a zero linhas.
CREATE OR REPLACE FUNCTION public.list_user_emails()
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, email FROM auth.users
  WHERE public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]);
$$;

REVOKE ALL ON FUNCTION public.list_user_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_user_emails() TO authenticated;

-- A policy "atualizar_proprio_profile" (0001) só deixa super_admin editar
-- o profile de outra pessoa. Para operacional também poder ativar/desativar
-- usuários na tela de gestão, adicionamos uma policy permissiva a mais
-- (RLS combina policies do mesmo comando com OR, então isso não afeta a
-- policy existente).
CREATE POLICY "admin_atualiza_profiles" ON public.profiles FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));
