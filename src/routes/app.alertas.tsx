import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES, ALERTAS_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Lock, Bell, CheckCircle2, KeyRound } from "lucide-react";
import { TAREFA_TIPO_LABEL, SOLICITACAO_TIPO_LABEL } from "@/lib/domain";
import { useAlertas, JANELA_PROXIMO_HORAS, type AlertaTarefa, type AlertaSolicitacao } from "@/lib/use-alertas";
import { toast } from "sonner";

export const Route = createFileRoute("/app/alertas")({
  component: Alertas,
});

function Alertas() {
  const { hasAnyRole } = useAuth();
  const podeVer = hasAnyRole(ALERTAS_ROLES);
  const podeAtender = hasAnyRole(FRONT_DESK_ROLES);
  const { atrasadas, proximas, aguardandoLiberacao, solicitacoesPendentes, loading, reload } = useAlertas(podeVer);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  if (!podeVer) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-3">
        <p className="text-sm text-muted-foreground">Você não tem permissão para ver os alertas.</p>
        <Link to="/app">
          <Button variant="outline" size="sm">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  async function marcarAtendida(s: AlertaSolicitacao) {
    setBusyIds((prev) => new Set(prev).add(s.id));
    const { error } = await supabase.from("solicitacoes").update({ status: "atendida" }).eq("id", s.id);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(s.id);
      return next;
    });
    if (error) return toast.error(error.message);
    toast.success("Solicitação marcada como atendida");
    reload();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Alertas</h1>
        <p className="text-sm text-muted-foreground">Coisas que precisam de atenção agora</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant={atrasadas.length > 0 ? "destructive" : "outline"}>{atrasadas.length} atrasada{atrasadas.length !== 1 ? "s" : ""}</Badge>
        <Badge variant={proximas.length > 0 ? "secondary" : "outline"} className={proximas.length > 0 ? "bg-warning/20 text-warning border-warning/40" : undefined}>
          {proximas.length} em breve
        </Badge>
        <Badge variant="outline">{aguardandoLiberacao.length} aguardando liberação</Badge>
        <Badge variant="outline">{solicitacoesPendentes.length} solicitação{solicitacoesPendentes.length !== 1 ? "ões" : ""} pendente{solicitacoesPendentes.length !== 1 ? "s" : ""}</Badge>
      </div>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <>
          <SecaoAlerta
            titulo="Tarefas atrasadas"
            icone={<AlertTriangle className="size-4 text-destructive" />}
            vazio="Nenhuma tarefa atrasada."
          >
            {atrasadas.map((t) => (
              <ItemTarefa key={t.id} t={t} tom="destructive" />
            ))}
          </SecaoAlerta>

          <SecaoAlerta
            titulo={`Check-in em até ${JANELA_PROXIMO_HORAS}h sem limpeza concluída`}
            icone={<Clock className="size-4 text-warning" />}
            vazio="Nada previsto para as próximas horas."
          >
            {proximas.map((t) => (
              <ItemTarefa key={t.id} t={t} tom="warning" />
            ))}
          </SecaoAlerta>

          <SecaoAlerta titulo="Aguardando liberação" icone={<Lock className="size-4 text-muted-foreground" />} vazio="Nenhuma unidade aguardando liberação.">
            {aguardandoLiberacao.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.nome}</div>
                  <div className="text-xs text-muted-foreground">{u.codigo} · sem liberação registrada hoje</div>
                </div>
                <Link to="/app/unidades/$id" params={{ id: u.id }}>
                  <Button variant="outline" size="sm">
                    Ver unidade
                  </Button>
                </Link>
              </div>
            ))}
          </SecaoAlerta>

          <SecaoAlerta titulo="Solicitações pendentes" icone={<Bell className="size-4 text-muted-foreground" />} vazio="Nenhuma solicitação pendente.">
            {solicitacoesPendentes.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-1.5">
                    {s.tipo === "senha_porta" && <KeyRound className="size-3.5 text-warning shrink-0" />}
                    {s.unidade?.nome ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.unidade?.codigo} · {s.tipo === "senha_porta" ? "Senha da porta solicitada" : (SOLICITACAO_TIPO_LABEL[s.tipo] ?? s.tipo)}
                    {s.descricao && ` · ${s.descricao}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {s.tipo === "senha_porta" && (
                    <Link to="/app/unidades/$id" params={{ id: s.unidadeId }}>
                      <Button variant="outline" size="sm">
                        Ver unidade
                      </Button>
                    </Link>
                  )}
                  {podeAtender ? (
                    <Button variant="outline" size="sm" onClick={() => marcarAtendida(s)} disabled={busyIds.has(s.id)}>
                      <CheckCircle2 className="size-4 mr-1" />
                      Atender
                    </Button>
                  ) : (
                    <Badge variant="outline">Pendente</Badge>
                  )}
                </div>
              </div>
            ))}
          </SecaoAlerta>
        </>
      )}
    </div>
  );
}

function SecaoAlerta({
  titulo,
  icone,
  vazio,
  children,
}: {
  titulo: string;
  icone: React.ReactNode;
  vazio: string;
  children: React.ReactNode;
}) {
  const temItens = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icone}
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>{temItens ? <div>{children}</div> : <div className="text-xs text-muted-foreground py-2">{vazio}</div>}</CardContent>
    </Card>
  );
}

function ItemTarefa({ t, tom }: { t: AlertaTarefa; tom: "destructive" | "warning" }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
      <div className="min-w-0">
        <div className="font-medium truncate">{t.unidade?.nome ?? "—"}</div>
        <div className="text-xs text-muted-foreground truncate">
          {t.unidade?.codigo} · {TAREFA_TIPO_LABEL[t.tipo] ?? t.tipo} · {t.horaPrevista.slice(0, 5)}
        </div>
      </div>
      <Link to="/app/tarefas/$id" params={{ id: t.id }} search={{ from: "alertas", dia: undefined }}>
        <Button variant={tom === "destructive" ? "destructive" : "outline"} size="sm">
          Resolver
        </Button>
      </Link>
    </div>
  );
}
