-- ============================================================
-- src/routes/cadastro.tsx (autocadastro público) passa telefone em
-- raw_user_meta_data junto com nome_completo, mas handle_new_user (0001)
-- só lia nome_completo — o telefone informado no cadastro se perdia.
-- Não edita 0001_init.sql — apenas substitui o corpo via CREATE OR REPLACE,
-- mesmo padrão de 0003_bloqueio_usuario_inativo.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome_completo, telefone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email), NEW.raw_user_meta_data->>'telefone');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending_user');
  RETURN NEW;
END; $$;
