-- ============================================================
-- BSB Stay & Help Estadias — Módulo Operacional
-- Schema inicial — informado pela auditoria do protótipo Lovable,
-- mas escrito do zero (ver DECISIONS.md para o raciocínio de cada escolha)
-- ============================================================

-- ============= ENUMS =============

-- Perfis de acesso. Enxuto de propósito: cobre só quem usa o Operacional
-- hoje. Novos módulos (Manutenção, Vistoria, Atendimento, Administrativo)
-- devem ADICIONAR valores aqui via `ALTER TYPE ... ADD VALUE`, nunca remover.
CREATE TYPE public.app_role AS ENUM (
  'camareira',
  'vistoriador',
  'atendimento',
  'operacional',    -- administrador operacional: acesso total ao módulo
  'manager',        -- sócios / gestão: visão consolidada (hoje = Operacional)
  'super_admin',    -- acesso técnico/sistema
  'pending_user'     -- recém-cadastrado, aguardando aprovação de um admin
);

CREATE TYPE public.unidade_status AS ENUM ('pendente','em_limpeza','em_vistoria','aguardando_liberacao','liberado','bloqueado');
CREATE TYPE public.tarefa_status AS ENUM ('pendente','em_andamento','pausada','concluida','cancelada');
CREATE TYPE public.tarefa_tipo AS ENUM ('limpeza_checkout','limpeza_intermediaria','vistoria','manutencao','enxoval','apoio_operacional');
CREATE TYPE public.tarefa_prioridade AS ENUM ('baixa','media','alta','urgente');
CREATE TYPE public.tipo_imovel AS ENUM ('apartamento','casa','studio','cobertura','flat');
CREATE TYPE public.tipo_cama AS ENUM ('casal','solteiro','queen','king','beliche','sofa_cama','berco');
CREATE TYPE public.metodo_entrada AS ENUM ('email','app','app_envio_dados','whatsapp','foto_cadastro');
CREATE TYPE public.solicitacao_tipo AS ENUM ('berco','cama_extra','enxoval_adicional','travesseiros_extras','checkin_antecipado','checkout_tardio','outro');
CREATE TYPE public.solicitacao_status AS ENUM ('pendente','atendida','cancelada');

-- ============= UTIL =============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============= PROFILES + ROLES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL DEFAULT '',
  telefone TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles));
$$;

-- Todo novo usuário nasce como pending_user até um admin aprovar o perfil real.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome_completo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending_user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= UNIDADE (núcleo — usado por todos os módulos futuros) =============
CREATE TABLE public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  endereco TEXT NOT NULL,
  regiao TEXT NOT NULL,
  tipo tipo_imovel NOT NULL DEFAULT 'apartamento',
  quartos INT NOT NULL DEFAULT 1 CHECK (quartos >= 0),
  banheiros INT NOT NULL DEFAULT 1 CHECK (banheiros >= 0),
  capacidade INT NOT NULL DEFAULT 2 CHECK (capacidade > 0),
  tempo_limpeza_min INT NOT NULL DEFAULT 90 CHECK (tempo_limpeza_min > 0),
  observacoes TEXT,
  status unidade_status NOT NULL DEFAULT 'pendente',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_unidades_status ON public.unidades(status);
CREATE INDEX idx_unidades_regiao ON public.unidades(regiao);
CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.quartos_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo_cama tipo_cama NOT NULL,
  quantidade INT NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  cama_extra BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quartos_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_quartos_unidade ON public.quartos_config(unidade_id);

-- ============= TAREFAS (coração do Operacional) =============
CREATE TABLE public.tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  tipo tarefa_tipo NOT NULL,
  prioridade tarefa_prioridade NOT NULL DEFAULT 'media',
  status tarefa_status NOT NULL DEFAULT 'pendente',
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vistoriador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ordem_dia INT,
  data_prevista DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_prevista TIME,
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  tempo_total_min INT,
  hospedes INT,
  noites INT,
  montagem_cama TEXT,
  senha_apartamento TEXT,
  metodo_entrada metodo_entrada,
  reserva_numero TEXT,          -- vínculo com a importação de reservas (Ayrton, via CSV por ora)
  observacoes TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tarefas_responsavel ON public.tarefas(responsavel_id);
CREATE INDEX idx_tarefas_unidade ON public.tarefas(unidade_id);
CREATE INDEX idx_tarefas_status ON public.tarefas(status);
CREATE INDEX idx_tarefas_data ON public.tarefas(data_prevista);
CREATE TRIGGER trg_tarefas_updated BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Múltiplas camareiras por tarefa (requisito confirmado no levantamento)
CREATE TABLE public.tarefa_camareiras (
  tarefa_id UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (tarefa_id, user_id)
);
ALTER TABLE public.tarefa_camareiras ENABLE ROW LEVEL SECURITY;

-- ============= DEMANDAS DE VISTORIA =============
-- Tabela própria desde o início (não jsonb) — decisão tomada para que o
-- futuro módulo de Vistoria (Fase 3) consulte e reporte sem parsing de JSON.
CREATE TABLE public.vistoria_demandas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  concluido BOOLEAN NOT NULL DEFAULT false,
  concluido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_em TIMESTAMPTZ,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vistoria_demandas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vistoria_demandas_tarefa ON public.vistoria_demandas(tarefa_id);
CREATE INDEX idx_vistoria_demandas_pendentes ON public.vistoria_demandas(tarefa_id) WHERE NOT concluido;
CREATE TRIGGER trg_vistoria_demandas_updated BEFORE UPDATE ON public.vistoria_demandas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= TEMPO REGISTROS (start/pause/finish) =============
CREATE TABLE public.tempo_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim TIMESTAMPTZ,
  duracao_min INT,
  tipo TEXT NOT NULL DEFAULT 'execucao',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tempo_registros ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tempo_tarefa ON public.tempo_registros(tarefa_id);
CREATE INDEX idx_tempo_user ON public.tempo_registros(user_id);

-- ============= SOLICITACOES (pedidos do hóspede) =============
CREATE TABLE public.solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  tarefa_id UUID REFERENCES public.tarefas(id) ON DELETE SET NULL,
  tipo solicitacao_tipo NOT NULL,
  descricao TEXT,
  status solicitacao_status NOT NULL DEFAULT 'pendente',
  reserva_numero TEXT,
  data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_solicitacoes_unidade ON public.solicitacoes(unidade_id);
CREATE TRIGGER trg_solicitacoes_updated BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= LIBERACOES (aprovação de check-in) =============
CREATE TABLE public.liberacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  liberado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  liberado BOOLEAN NOT NULL,
  observacoes TEXT,
  data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.liberacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_liberacoes_unidade ON public.liberacoes(unidade_id);

-- ============= AUDIT LOG =============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  tabela TEXT NOT NULL,
  registro_id UUID,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_log_tabela ON public.audit_log(tabela, registro_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

CREATE POLICY "ver_proprio_profile" ON public.profiles FOR SELECT
  USING (auth.uid() = user_id OR public.has_any_role(auth.uid(), ARRAY['operacional','manager','super_admin']::app_role[]));
CREATE POLICY "atualizar_proprio_profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "ver_proprias_roles" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_any_role(auth.uid(), ARRAY['operacional','manager','super_admin']::app_role[]));
CREATE POLICY "admin_gerencia_roles_insert" ON public.user_roles FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));
CREATE POLICY "admin_gerencia_roles_update" ON public.user_roles FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));
CREATE POLICY "admin_gerencia_roles_delete" ON public.user_roles FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));

CREATE POLICY "auth_le_unidades" ON public.unidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestores_inserem_unidades" ON public.unidades FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));
CREATE POLICY "gestores_atualizam_unidades" ON public.unidades FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','vistoriador','super_admin']::app_role[]));
CREATE POLICY "admin_deleta_unidades" ON public.unidades FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));

CREATE POLICY "auth_le_quartos" ON public.quartos_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestores_gerenciam_quartos" ON public.quartos_config FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));

CREATE POLICY "ver_tarefas" ON public.tarefas FOR SELECT
  USING (
    auth.uid() = responsavel_id
    OR public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','manager','super_admin']::app_role[])
    OR (public.has_role(auth.uid(),'vistoriador') AND (tipo = 'vistoria' OR vistoriador_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.tarefa_camareiras tc WHERE tc.tarefa_id = id AND tc.user_id = auth.uid())
  );
CREATE POLICY "criar_tarefas" ON public.tarefas FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[]));
CREATE POLICY "atualizar_tarefas" ON public.tarefas FOR UPDATE
  USING (
    auth.uid() = responsavel_id
    OR public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','vistoriador','super_admin']::app_role[])
    OR EXISTS (SELECT 1 FROM public.tarefa_camareiras tc WHERE tc.tarefa_id = id AND tc.user_id = auth.uid())
  );
CREATE POLICY "admin_deleta_tarefas" ON public.tarefas FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));

CREATE POLICY "ver_tarefa_camareiras" ON public.tarefa_camareiras FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','manager','super_admin']::app_role[])
  );
CREATE POLICY "gerenciar_tarefa_camareiras" ON public.tarefa_camareiras FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[]));

CREATE POLICY "ver_vistoria_demandas" ON public.vistoria_demandas FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','manager','super_admin']::app_role[])
    OR public.has_role(auth.uid(),'vistoriador')
    OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id AND t.responsavel_id = auth.uid())
  );
CREATE POLICY "criar_vistoria_demandas" ON public.vistoria_demandas FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[]));
CREATE POLICY "atualizar_vistoria_demandas" ON public.vistoria_demandas FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[])
    OR public.has_role(auth.uid(),'vistoriador')
  );
CREATE POLICY "deletar_vistoria_demandas" ON public.vistoria_demandas FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));

CREATE POLICY "ver_tempo" ON public.tempo_registros FOR SELECT
  USING (auth.uid() = user_id OR public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','manager','super_admin']::app_role[]));
CREATE POLICY "inserir_tempo" ON public.tempo_registros FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "atualizar_tempo" ON public.tempo_registros FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "ver_solicitacoes" ON public.solicitacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "criar_solicitacoes" ON public.solicitacoes FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[]));
CREATE POLICY "atualizar_solicitacoes" ON public.solicitacoes FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[]));
CREATE POLICY "deletar_solicitacoes" ON public.solicitacoes FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));

CREATE POLICY "ver_liberacoes" ON public.liberacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "criar_liberacoes" ON public.liberacoes FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['operacional','atendimento','super_admin']::app_role[]));

CREATE POLICY "ver_audit_log" ON public.audit_log FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['operacional','super_admin']::app_role[]));
CREATE POLICY "sistema_insere_audit_log" ON public.audit_log FOR INSERT
  WITH CHECK (true);
