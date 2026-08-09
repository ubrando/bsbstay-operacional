import { Link } from "@tanstack/react-router";
import {
  useAuth,
  ROLE_LABELS,
  OPERATOR_ROLES,
  FRONT_DESK_ROLES,
  ALERTAS_ROLES,
  METRICAS_ROLES,
  isSomenteExecucao,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, ClipboardList, KanbanSquare, Building2, Users, LogOut, Bell, BarChart3 } from "lucide-react";
import { useAlertas } from "@/lib/use-alertas";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, roles, hasAnyRole, signOut } = useAuth();
  const podeVerAlertas = hasAnyRole(ALERTAS_ROLES);
  const { atrasadas, proximas, total: totalAlertas } = useAlertas(podeVerAlertas);

  // Mesmos critérios já usados pra bloquear acesso a cada tela — o menu não
  // deve listar nada que a própria página vá recusar mostrar.
  const somenteExecucao = isSomenteExecucao(roles);
  const podeVerPainel = podeVerAlertas; // FRONT_DESK_ROLES ou manager, igual à tela de Alertas
  const podeAdminOperacional = hasAnyRole(FRONT_DESK_ROLES); // gate de app.kanban.tsx / app.unidades.*
  const podeGerenciarUsuarios = hasAnyRole(OPERATOR_ROLES); // mesmo gate de app.usuarios.tsx
  const podeVerMetricas = hasAnyRole(METRICAS_ROLES);

  const nav = somenteExecucao
    ? [{ to: "/app/minhas-tarefas" as const, label: "Minhas tarefas", icon: ClipboardList }]
    : [
        ...(podeVerPainel ? [{ to: "/app" as const, label: "Painel", icon: LayoutDashboard }] : []),
        { to: "/app/minhas-tarefas" as const, label: "Minhas tarefas", icon: ClipboardList },
        ...(podeAdminOperacional ? [{ to: "/app/kanban" as const, label: "Kanban", icon: KanbanSquare }] : []),
        ...(podeAdminOperacional ? [{ to: "/app/unidades" as const, label: "Unidades", icon: Building2 }] : []),
        ...(podeGerenciarUsuarios ? [{ to: "/app/usuarios" as const, label: "Usuários", icon: Users }] : []),
        ...(podeVerMetricas ? [{ to: "/app/metricas" as const, label: "Métricas", icon: BarChart3 }] : []),
        ...(podeVerAlertas ? [{ to: "/app/alertas" as const, label: "Alertas", icon: Bell }] : []),
      ];

  const alertaUrgente = atrasadas.length > 0 || proximas.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b flex items-center justify-between px-4 h-14 shrink-0">
        <div className="font-semibold text-sm">BSB Stay & Help Estadias</div>
        <nav className="flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md hover:bg-accent text-muted-foreground [&.active]:bg-accent [&.active]:text-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
              {item.to === "/app/alertas" && totalAlertas > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold text-white ${alertaUrgente ? "bg-destructive" : "bg-warning"}`}
                >
                  {totalAlertas}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground text-right">
            <div>{user?.email}</div>
            <div>{roles.map((r) => ROLE_LABELS[r]).join(", ")}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
