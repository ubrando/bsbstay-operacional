import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Play, Pause, CheckCircle2, Clock, KeyRound, Plus, Square, CheckSquare, ClipboardCheck } from "lucide-react";
import { TAREFA_TIPO_LABEL, TAREFA_STATUS_LABEL, statusBadgeVariant, formatMin } from "@/lib/domain";
import { toast } from "sonner";
import { AtribuirResponsaveis } from "@/components/AtribuirResponsaveis";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/tarefas/$id")({
  component: TarefaDetalhe,
});

type Tarefa = Database["public"]["Tables"]["tarefas"]["Row"] & { unidades?: { nome: string; codigo: string } | null };

function TarefaDetalhe() {
  const { id } = Route.useParams();
  const { user, hasAnyRole } = useAuth();
  const podeEditar = hasAnyRole(FRONT_DESK_ROLES);

  const [t, setT] = useState<Tarefa | null>(null);
  const [camareiras, setCamareiras] = useState<{ user_id: string; nome_completo: string }[]>([]);
  const [tempos, setTempos] = useState<Database["public"]["Tables"]["tempo_registros"]["Row"][]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("tarefas").select("*, unidades:unidade_id(nome, codigo)").eq("id", id).maybeSingle();
    setT(data as Tarefa | null);

    const { data: camRows } = await supabase.from("tarefa_camareiras").select("user_id").eq("tarefa_id", id);
    const camIds = (camRows ?? []).map((c) => c.user_id);
    if (camIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, nome_completo").in("user_id", camIds);
      setCamareiras(profs ?? []);
    } else {
      setCamareiras([]);
    }

    const { data: temposData } = await supabase.from("tempo_registros").select("*").eq("tarefa_id", id).order("inicio", { ascending: false });
    setTempos(temposData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);
  useRealtimeRefresh(["tarefas", "tarefa_camareiras", "tempo_registros", "vistoria_demandas"], load);

  async function mudarStatus(status: Database["public"]["Enums"]["tarefa_status"]) {
    if (!t) return;
    setBusy(true);
    const patch: Database["public"]["Tables"]["tarefas"]["Update"] = { status };
    if (status === "em_andamento" && t.status !== "em_andamento") patch.iniciado_em = new Date().toISOString();
    if (status === "concluida") patch.finalizado_em = new Date().toISOString();
    const { error } = await supabase.from("tarefas").update(patch).eq("id", t.id);
    if (!error && user && (status === "em_andamento" || status === "concluida")) {
      // Fecha o registro de tempo em aberto, se houver, ou abre um novo
      if (status === "em_andamento") {
        await supabase.from("tempo_registros").insert({ tarefa_id: t.id, user_id: user.id });
      } else {
        const aberto = tempos.find((tr) => !tr.fim);
        if (aberto) {
          const fim = new Date();
          const inicio = new Date(aberto.inicio);
          await supabase
            .from("tempo_registros")
            .update({ fim: fim.toISOString(), duracao_min: Math.round((fim.getTime() - inicio.getTime()) / 60000) })
            .eq("id", aberto.id);
        }
      }
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    load();
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;
  if (!t) return <div className="text-center py-8 text-muted-foreground text-sm">Tarefa não encontrada.</div>;

  const tempoTotal = tempos.reduce((acc, tr) => acc + (tr.duracao_min ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/app/kanban">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="size-4 mr-1" />
            Voltar ao kanban
          </Button>
        </Link>
        <Badge variant={statusBadgeVariant(t.status)}>{TAREFA_STATUS_LABEL[t.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {t.unidades?.nome ?? "—"} <span className="text-muted-foreground font-normal">· {TAREFA_TIPO_LABEL[t.tipo]}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Data prevista</div>
              <div>{t.data_prevista}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs flex items-center gap-1">
                <Clock className="size-3.5" /> Tempo registrado
              </div>
              <div>{formatMin(tempoTotal)}</div>
            </div>
            {t.senha_apartamento && (
              <div>
                <div className="text-muted-foreground text-xs flex items-center gap-1">
                  <KeyRound className="size-3.5" /> Senha
                </div>
                <div className="font-mono font-bold">{t.senha_apartamento}</div>
              </div>
            )}
          </div>

          {podeEditar && (
            <div className="flex gap-2 flex-wrap">
              {t.status !== "em_andamento" && t.status !== "concluida" && (
                <Button size="sm" onClick={() => mudarStatus("em_andamento")} disabled={busy}>
                  <Play className="size-4 mr-1" /> Iniciar
                </Button>
              )}
              {t.status === "em_andamento" && (
                <Button size="sm" variant="outline" onClick={() => mudarStatus("pausada")} disabled={busy}>
                  <Pause className="size-4 mr-1" /> Pausar
                </Button>
              )}
              {t.status !== "concluida" && (
                <Button size="sm" variant="default" onClick={() => mudarStatus("concluida")} disabled={busy}>
                  <CheckCircle2 className="size-4 mr-1" /> Concluir
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Responsáveis</CardTitle>
        </CardHeader>
        <CardContent>
          <AtribuirResponsaveis
            tarefaId={t.id}
            tipo={t.tipo}
            vistoriadorId={t.vistoriador_id}
            camareiras={camareiras}
            onChange={load}
            bloqueado={t.status === "concluida"}
          />
        </CardContent>
      </Card>

      <DemandasVistoria tarefaId={t.id} tarefaStatus={t.status} vistoriadorId={t.vistoriador_id} />
    </div>
  );
}

interface DemandaItem {
  id: string;
  texto: string;
  concluido: boolean;
}

function DemandasVistoria({ tarefaId, tarefaStatus, vistoriadorId }: { tarefaId: string; tarefaStatus: string; vistoriadorId: string | null }) {
  const { user, hasAnyRole } = useAuth();
  const [itens, setItens] = useState<DemandaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const podeEditar = hasAnyRole(FRONT_DESK_ROLES);
  const ehVistoriador = vistoriadorId === user?.id;
  const podeMarcar = podeEditar || ehVistoriador || hasAnyRole(["vistoriador"]);
  const concluidaTarefa = tarefaStatus === "concluida";

  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);

  async function carregar() {
    const { data, error } = await supabase
      .from("vistoria_demandas")
      .select("id, texto, concluido")
      .eq("tarefa_id", tarefaId)
      .order("created_at", { ascending: true });
    if (!error) setItens(data ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [tarefaId]);
  useRealtimeRefresh(["vistoria_demandas"], carregar);

  async function adicionar() {
    if (!novo.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("vistoria_demandas").insert({ tarefa_id: tarefaId, texto: novo.trim(), criado_por: user?.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNovo("");
    carregar();
  }

  async function toggle(item: DemandaItem) {
    setBusy(true);
    const { error } = await supabase
      .from("vistoria_demandas")
      .update({
        concluido: !item.concluido,
        concluido_por: !item.concluido ? user?.id : null,
        concluido_em: !item.concluido ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    carregar();
  }

  if (carregando) return null;
  if (itens.length === 0 && !podeEditar) return null;

  const pendentes = itens.filter((d) => !d.concluido).length;

  return (
    <Card className={pendentes > 0 ? "border-warning/50 bg-warning/5" : undefined}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardCheck className="size-4" />
          Demandas para vistoria
          {itens.length > 0 && (
            <Badge variant={pendentes > 0 ? "outline" : "default"} className="text-[10px]">
              {itens.length - pendentes}/{itens.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {itens.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhuma demanda registrada. Adicione orientações específicas para o vistoriador.</div>
        ) : (
          <ul className="space-y-1.5">
            {itens.map((d) => (
              <li key={d.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => podeMarcar && !concluidaTarefa && toggle(d)}
                  disabled={!podeMarcar || concluidaTarefa || busy}
                  className="mt-0.5 shrink-0 disabled:opacity-50"
                  aria-label={d.concluido ? "Desmarcar" : "Marcar como concluída"}
                >
                  {d.concluido ? <CheckSquare className="size-5 text-success" /> : <Square className="size-5 text-muted-foreground hover:text-foreground" />}
                </button>
                <span className={`text-sm ${d.concluido ? "line-through text-muted-foreground" : ""}`}>{d.texto}</span>
              </li>
            ))}
          </ul>
        )}
        {podeEditar && !concluidaTarefa && (
          <div className="flex gap-2 pt-1">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              placeholder="Nova demanda..."
              className="h-8 text-sm"
            />
            <Button size="sm" variant="outline" onClick={adicionar} disabled={busy || !novo.trim()}>
              <Plus className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
