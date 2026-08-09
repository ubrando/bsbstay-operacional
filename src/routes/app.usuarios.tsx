import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, OPERATOR_ROLES, ASSIGNABLE_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShieldAlert, UserRound, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/usuarios")({
  component: UsuariosPage,
});

function UsuariosPage() {
  const { hasAnyRole } = useAuth();

  if (!hasAnyRole(OPERATOR_ROLES)) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-3">
        <p className="text-sm text-muted-foreground">Você não tem permissão para acessar a gestão de usuários.</p>
        <Link to="/app">
          <Button variant="outline" size="sm">
            Voltar ao painel
          </Button>
        </Link>
      </div>
    );
  }

  return <UsuariosGestao />;
}

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Usuario = Profile & { roles: AppRole[]; email: string | null };

function isPendente(u: Usuario) {
  return u.roles.length === 0 || (u.roles.length === 1 && u.roles[0] === "pending_user");
}

const TODOS = "todos";

function UsuariosGestao() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroRole, setFiltroRole] = useState<string>(TODOS);
  const [filtroStatus, setFiltroStatus] = useState<string>(TODOS);
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: profiles, error: profErr }, { data: roleRows, error: roleErr }, { data: emailRows }] = await Promise.all([
      supabase.from("profiles").select("*").order("nome_completo", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.rpc("list_user_emails"),
    ]);
    if (profErr) console.error(profErr);
    if (roleErr) console.error(roleErr);

    const roleMap = new Map<string, AppRole[]>();
    (roleRows ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const emailMap = new Map<string, string>();
    (emailRows ?? []).forEach((e) => emailMap.set(e.user_id, e.email));

    setUsuarios((profiles ?? []).map((p) => ({ ...p, roles: roleMap.get(p.user_id) ?? [], email: emailMap.get(p.user_id) ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(["profiles", "user_roles"], load);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = usuarios.filter((u) => {
      if (q && !u.nome_completo.toLowerCase().includes(q)) return false;
      if (somentePendentes && !isPendente(u)) return false;
      if (filtroRole !== TODOS && !u.roles.includes(filtroRole as AppRole)) return false;
      if (filtroStatus === "ativo" && !u.ativo) return false;
      if (filtroStatus === "inativo" && u.ativo) return false;
      return true;
    });
    return [...lista].sort((a, b) => {
      const pa = isPendente(a) ? 0 : 1;
      const pb = isPendente(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.nome_completo.localeCompare(b.nome_completo);
    });
  }, [usuarios, busca, filtroRole, filtroStatus, somentePendentes]);

  const pendentesCount = useMemo(() => usuarios.filter(isPendente).length, [usuarios]);

  async function trocarRole(userId: string, novaRole: AppRole) {
    setBusyId(userId);
    try {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role: novaRole });
      if (insErr) throw insErr;
      toast.success("Perfil de acesso atualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar perfil");
    } finally {
      setBusyId(null);
    }
  }

  async function alternarAtivo(userId: string, ativo: boolean) {
    setBusyId(userId);
    const { error } = await supabase.from("profiles").update({ ativo }).eq("user_id", userId);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(ativo ? "Usuário ativado" : "Usuário desativado");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Usuários e permissões</h1>
        <p className="text-muted-foreground text-sm">{usuarios.length} cadastrados</p>
      </header>

      {pendentesCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
          <ShieldAlert className="size-4 text-warning shrink-0" />
          {pendentesCount} usuário{pendentesCount > 1 ? "s" : ""} aguardando aprovação de perfil.
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 pl-8" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filtroRole} onValueChange={setFiltroRole}>
          <SelectTrigger className="h-9 w-auto min-w-[150px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as roles</SelectItem>
            {ASSIGNABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-9 w-auto min-w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant={somentePendentes ? "default" : "outline"}
          className="h-9"
          onClick={() => setSomentePendentes((v) => !v)}
        >
          <Hourglass className="size-4" />
          Só pendentes
        </Button>
      </div>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            {usuarios.length === 0 ? "Nenhum usuário cadastrado ainda." : "Nenhum usuário bate com a busca/filtros."}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {filtrados.map((u) => (
              <UsuarioLinha key={u.user_id} usuario={u} busy={busyId === u.user_id} onTrocarRole={trocarRole} onAlternarAtivo={alternarAtivo} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function UsuarioLinha({
  usuario,
  busy,
  onTrocarRole,
  onAlternarAtivo,
}: {
  usuario: Usuario;
  busy: boolean;
  onTrocarRole: (userId: string, role: AppRole) => void;
  onAlternarAtivo: (userId: string, ativo: boolean) => void;
}) {
  const pendente = isPendente(usuario);
  const ehSuperAdmin = usuario.roles.includes("super_admin");
  const roleAtual = usuario.roles[0] ?? "pending_user";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex items-center gap-3 flex-1">
        <div className="size-9 rounded-full bg-muted flex items-center justify-center shrink-0">
          <UserRound className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate flex items-center gap-1.5">
            {usuario.nome_completo || "—"}
            {pendente && (
              <Badge variant="outline" className="text-[10px] text-warning border-warning/50">
                Pendente
              </Badge>
            )}
            {!usuario.ativo && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Inativo
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {usuario.email ?? "—"}
            {usuario.telefone && ` · ${usuario.telefone}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {ehSuperAdmin ? (
          <Badge variant="secondary">{ROLE_LABELS.super_admin}</Badge>
        ) : (
          <Select value={roleAtual} onValueChange={(v) => onTrocarRole(usuario.user_id, v as AppRole)} disabled={busy}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-1.5">
          <Switch checked={usuario.ativo} onCheckedChange={(v) => onAlternarAtivo(usuario.user_id, v)} disabled={busy} aria-label="Usuário ativo" />
        </div>
      </div>
    </div>
  );
}
