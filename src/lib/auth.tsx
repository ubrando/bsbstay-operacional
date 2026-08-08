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
  signOut: () => Promise<void>;
}

/** Administra o módulo Operacional por completo. */
export const OPERATOR_ROLES: AppRole[] = ["operacional", "super_admin"];
/** Acesso amplo de edição operacional (inclui atendimento). */
export const FRONT_DESK_ROLES: AppRole[] = [...OPERATOR_ROLES, "atendimento"];

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setTimeout(() => loadRoles(s.user.id), 0);
      else setRoles([]);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRoles(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadRoles(uid: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role));
  }

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const isSuperAdmin = roles.includes("super_admin");
  const isOperator = OPERATOR_ROLES.some((r) => roles.includes(r));
  const isFrontDesk = FRONT_DESK_ROLES.some((r) => roles.includes(r));
  const isPending = roles.length === 0 || (roles.length === 1 && roles[0] === "pending_user");

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <Ctx.Provider value={{ user, session, roles, loading, hasRole, hasAnyRole, isSuperAdmin, isOperator, isFrontDesk, isPending, signOut }}>
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
