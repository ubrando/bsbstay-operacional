import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (rs: AppRole[]) => boolean;
  isSuperAdmin: boolean;
  isOperator: boolean;
  isFrontDesk: boolean;
  isPending: boolean;
  isInactive: boolean;
  signOut: () => Promise<void>;
}

/** Administra o módulo Operacional por completo. */
export const OPERATOR_ROLES: AppRole[] = ["operacional", "super_admin"];
/** Acesso amplo de edição operacional (inclui atendimento). */
export const FRONT_DESK_ROLES: AppRole[] = [...OPERATOR_ROLES, "atendimento"];

const SOMENTE_EXECUCAO_ROLES: AppRole[] = ["camareira", "vistoriador"];

/** Só executa tarefas no dia a dia (sem acesso administrativo) — usado pra
 *  decidir se o Painel deve redirecionar direto pra Minhas tarefas. */
export function isSomenteExecucao(roles: AppRole[]): boolean {
  return roles.length > 0 && roles.every((r) => SOMENTE_EXECUCAO_ROLES.includes(r));
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [ativo, setAtivo] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setTimeout(() => loadPerfil(s.user.id), 0);
      else {
        setRoles([]);
        setAtivo(true);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadPerfil(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /** Carrega roles e o campo `ativo` do profile — ambos decidem se o acesso é liberado. */
  async function loadPerfil(uid: string) {
    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("ativo").eq("user_id", uid).maybeSingle(),
    ]);
    setRoles((roleRows ?? []).map((r) => r.role));
    setAtivo(profile?.ativo ?? true);
  }

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const isSuperAdmin = roles.includes("super_admin");
  const isOperator = OPERATOR_ROLES.some((r) => roles.includes(r));
  const isFrontDesk = FRONT_DESK_ROLES.some((r) => roles.includes(r));
  const isPending = roles.length === 0 || (roles.length === 1 && roles[0] === "pending_user");
  const isInactive = !ativo;

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <Ctx.Provider
      value={{ user, session, roles, loading, hasRole, hasAnyRole, isSuperAdmin, isOperator, isFrontDesk, isPending, isInactive, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return c;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  camareira: "Camareira",
  vistoriador: "Vistoriador",
  atendimento: "Atendimento",
  operacional: "Administrador operacional",
  manager: "Gestor / Sócio",
  super_admin: "Super Admin",
  pending_user: "Pendente de aprovação",
};

/** Perfis que um admin pode atribuir a alguém via UI (exclui super_admin — esse é setado manualmente no banco). */
export const ASSIGNABLE_ROLES: AppRole[] = ["operacional", "manager", "atendimento", "vistoriador", "camareira", "pending_user"];
