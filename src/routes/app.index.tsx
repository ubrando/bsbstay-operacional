import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Upload, KanbanSquare, BarChart3, Bell, AlertTriangle } from "lucide-react";
import { useAuth, FRONT_DESK_ROLES, ALERTAS_ROLES, METRICAS_ROLES, isSomenteExecucao } from "@/lib/auth";
import { useAlertas } from "@/lib/use-alertas";

export const Route = createFileRoute("/app/")({
  component: Painel,
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dataPorExtenso(): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

interface ResumoDia {
  total: number;
  concluidas: number;
  pendentes: number;
}

function Painel() {
  const { user, roles, hasAnyRole } = useAuth();
  const nav = useNavigate();
  const podeCriar = hasAnyRole(FRONT_DESK_ROLES);
  const podeVerAlertas = hasAnyRole(ALERTAS_ROLES);
  const podeVerMetricas = hasAnyRole(METRICAS_ROLES);
  const somenteExecucao = isSomenteExecucao(roles);

  const [primeiroNome, setPrimeiroNome] = useState("");
  const [resumo, setResumo] = useState<ResumoDia | null>(null);
  const { atrasadas, total: totalAlertas } = useAlertas(podeVerAlertas);

  useEffect(() => {
    if (somenteExecucao) nav({ to: "/app/minhas-tarefas" });
  }, [somenteExecucao]);

  useEffect(() => {
    if (!user || somenteExecucao) return;
    supabase
      .from("profiles")
      .select("nome_completo")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setPrimeiroNome(data?.nome_completo?.split(" ")[0] ?? ""));
  }, [user, somenteExecucao]);

  useEffect(() => {
    if (somenteExecucao) return;
    // Mesma query do Kanban (tarefas do dia), só que sem as colunas extras
    // que a UI de cards do Kanban precisa — aqui é só contagem.
    supabase
      .from("tarefas")
      .select("id,status")
      .eq("data_prevista", todayStr())
      .then(({ data, error }) => {
        if (error) return console.error(error);
        const ts = data ?? [];
        const concluidas = ts.filter((t) => t.status === "concluida").length;
        const canceladas = ts.filter((t) => t.status === "cancelada").length;
        setResumo({ total: ts.length, concluidas, pendentes: ts.length - concluidas - canceladas });
      });
  }, [somenteExecucao]);

  if (somenteExecucao) return null;

  const atalhos = [
    { to: "/app/kanban" as const, label: "Kanban", icon: KanbanSquare, visivel: true },
    { to: "/app/tarefas/nova" as const, label: "Nova tarefa", icon: Plus, visivel: podeCriar },
    { to: "/app/importar" as const, label: "Importar reservas", icon: Upload, visivel: podeCriar },
    { to: "/app/metricas" as const, label: "Métricas", icon: BarChart3, visivel: podeVerMetricas },
  ].filter((a) => a.visivel);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Olá{primeiroNome ? `, ${primeiroNome}` : ""}!</h1>
          <p className="text-sm text-muted-foreground capitalize">{dataPorExtenso()}</p>
        </div>
        {podeCriar && (
          <div className="flex gap-2">
            <Link to="/app/importar">
              <Button size="sm" variant="outline">
                <Upload className="size-4" />
                Importar reservas
              </Button>
            </Link>
            <Link to="/app/tarefas/nova">
              <Button size="sm">
                <Plus className="size-4" />
                Nova tarefa
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Tarefas hoje</div>
            <div className="text-3xl font-semibold">{resumo ? resumo.total : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Concluídas</div>
            <div className="text-3xl font-semibold">{resumo ? resumo.concluidas : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Pendentes</div>
            <div className="text-3xl font-semibold">{resumo ? resumo.pendentes : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {podeVerAlertas && (
        <Link to="/app/alertas">
          <Card className={`transition hover:border-primary ${atrasadas.length > 0 ? "border-destructive/60 bg-destructive/5" : ""}`}>
            <CardContent className="p-4 flex items-center gap-3">
              {atrasadas.length > 0 ? <AlertTriangle className="size-6 text-destructive shrink-0" /> : <Bell className="size-6 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""} ativo{totalAlertas !== 1 ? "s" : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {atrasadas.length > 0 ? `${atrasadas.length} tarefa(s) atrasada(s) — veja o que precisa de atenção` : "Tudo em dia por enquanto"}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {atalhos.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Atalhos rápidos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {atalhos.map((a) => (
              <Link key={a.to} to={a.to}>
                <Card className="transition hover:border-primary hover:bg-accent/50">
                  <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
                    <a.icon className="size-6 text-primary" />
                    <span className="text-sm font-medium">{a.label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
