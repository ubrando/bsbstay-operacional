import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES, OPERATOR_ROLES, AUDITORIA_ROLES } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Play, Pause, CheckCircle2, Clock, Plus, Square, CheckSquare, ClipboardCheck, Pencil, Trash2, Check, X, History } from "lucide-react";
import { TAREFA_TIPO_LABEL, TAREFA_STATUS_LABEL, statusBadgeVariant, formatMin } from "@/lib/domain";
import { toast } from "sonner";
import { AtribuirResponsaveis } from "@/components/AtribuirResponsaveis";
import { SenhaPorta } from "@/components/SenhaPorta";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import { useMudarStatusTarefa } from "@/lib/use-mudar-status-tarefa";
import { useExcluirTarefa } from "@/lib/use-excluir-tarefa";
import { useHistorico, type HistoricoItem } from "@/lib/use-historico";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/tarefas/$id")({
  component: TarefaDetalhe,
  validateSearch: (search: Record<string, unknown>) => ({
    from:
      search.from === "minhas-tarefas"
        ? ("minhas-tarefas" as const)
        : search.from === "alertas"
          ? ("alertas" as const)
          : search.from === "kanban"
            ? ("kanban" as const)
            : undefined,
    dia: typeof search.dia === "string" ? search.dia : undefined,
  }),
});

type Tarefa = Database["public"]["Tables"]["tarefas"]["Row"] & {
  unidades?: { nome: string; codigo: string; senha_porta: string | null } | null;
};

function TarefaDetalhe() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const nav = useNavigate();
  const { hasAnyRole } = useAuth();
  const podeEditar = hasAnyRole(FRONT_DESK_ROLES);
  const podeExcluir = hasAnyRole(OPERATOR_ROLES);
  const podeVerHistorico = hasAnyRole(AUDITORIA_ROLES);

  const [t, setT] = useState<Tarefa | null>(null);
  const [camareiras, setCamareiras] = useState<{ user_id: string; nome_completo: string }[]>([]);
  const [tempos, setTempos] = useState<Database["public"]["Tables"]["tempo_registros"]["Row"][]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const { mudarStatus: mudarStatusBase, busyId } = useMudarStatusTarefa();
  const { excluirTarefa, excluindo } = useExcluirTarefa();

  async function load() {
    const { data } = await supabase.from("tarefas").select("*, unidades:unidade_id(nome, codigo, senha_porta)").eq("id", id).maybeSingle();
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
    const { error } = await mudarStatusBase(t.id, t.status, status);
    if (error) return toast.error(error);
    toast.success("Status atualizado");
    load();
  }

  function voltarParaOrigem() {
    if (search.from === "minhas-tarefas") return nav({ to: "/app/minhas-tarefas", search: search.dia ? { dia: search.dia } : {} });
    if (search.from === "alertas") return nav({ to: "/app/alertas" });
    return nav({ to: "/app/kanban", search: search.dia ? { dia: search.dia } : {} });
  }

  async function confirmarExclusao() {
    if (!t) return;
    const { error } = await excluirTarefa(t.id);
    setConfirmandoExclusao(false);
    if (error) return toast.error("Não foi possível excluir: " + error);
    toast.success("Tarefa excluída");
    voltarParaOrigem();
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;
  if (!t) return <div className="text-center py-8 text-muted-foreground text-sm">Tarefa não encontrada.</div>;

  const tempoTotal = tempos.reduce((acc, tr) => acc + (tr.duracao_min ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        {search.from === "minhas-tarefas" ? (
          <Link to="/app/minhas-tarefas" search={search.dia ? { dia: search.dia } : {}}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="size-4 mr-1" />
              Voltar para Minhas tarefas
            </Button>
          </Link>
        ) : search.from === "alertas" ? (
          <Link to="/app/alertas">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="size-4 mr-1" />
              Voltar para Alertas
            </Button>
          </Link>
        ) : (
          <Link to="/app/kanban" search={search.dia ? { dia: search.dia } : {}}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="size-4 mr-1" />
              Voltar ao Kanban
            </Button>
          </Link>
        )}
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
          </div>

          <SenhaPorta
            tarefaId={t.id}
            unidadeId={t.unidade_id}
            dataPrevista={t.data_prevista}
            senhaTarefa={t.senha_apartamento}
            senhaUnidade={t.unidades?.senha_porta}
          />

          {podeEditar && (
            <div className="flex gap-2 flex-wrap">
              {t.status !== "em_andamento" && t.status !== "concluida" && (
                <Button size="sm" onClick={() => mudarStatus("em_andamento")} disabled={busyId === t.id}>
                  <Play className="size-4 mr-1" /> Iniciar
                </Button>
              )}
              {t.status === "em_andamento" && (
                <Button size="sm" variant="outline" onClick={() => mudarStatus("pausada")} disabled={busyId === t.id}>
                  <Pause className="size-4 mr-1" /> Pausar
                </Button>
              )}
              {t.status !== "concluida" && (
                <Button size="sm" variant="default" onClick={() => mudarStatus("concluida")} disabled={busyId === t.id}>
                  <CheckCircle2 className="size-4 mr-1" /> Concluir
                </Button>
              )}
              {podeExcluir && (
                <Button size="sm" variant="destructive" className="ml-auto" onClick={() => setConfirmandoExclusao(true)}>
                  <Trash2 className="size-4 mr-1" /> Excluir tarefa
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

      <HistoricoTarefa tarefaId={t.id} podeVer={podeVerHistorico} />

      <AlertDialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O tempo registrado, as camareiras vinculadas e as demandas de vistoria dessa tarefa também são
              apagados junto. Solicitações do hóspede vinculadas a ela não são apagadas, só perdem o vínculo com a tarefa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarExclusao} disabled={excluindo}>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");

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

  function iniciarEdicao(item: DemandaItem) {
    setEditandoId(item.id);
    setEditTexto(item.texto);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditTexto("");
  }

  async function salvarEdicao() {
    if (!editandoId || !editTexto.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("vistoria_demandas").update({ texto: editTexto.trim() }).eq("id", editandoId);
    setBusy(false);
    if (error) return toast.error(error.message);
    setEditandoId(null);
    setEditTexto("");
    carregar();
  }

  async function remover(item: DemandaItem) {
    setBusy(true);
    const { error } = await supabase.from("vistoria_demandas").delete().eq("id", item.id);
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
                {editandoId === d.id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      value={editTexto}
                      onChange={(e) => setEditTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") salvarEdicao();
                        if (e.key === "Escape") cancelarEdicao();
                      }}
                      autoFocus
                      className="h-7 text-sm"
                    />
                    <button
                      type="button"
                      onClick={salvarEdicao}
                      disabled={busy || !editTexto.trim()}
                      className="shrink-0 disabled:opacity-50"
                      aria-label="Salvar"
                    >
                      <Check className="size-4 text-success" />
                    </button>
                    <button type="button" onClick={cancelarEdicao} disabled={busy} className="shrink-0" aria-label="Cancelar">
                      <X className="size-4 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className={`text-sm flex-1 ${d.concluido ? "line-through text-muted-foreground" : ""}`}>{d.texto}</span>
                    {podeEditar && !concluidaTarefa && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => iniciarEdicao(d)} disabled={busy} aria-label="Editar">
                          <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button type="button" onClick={() => remover(d)} disabled={busy} aria-label="Excluir">
                          <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    )}
                  </>
                )}
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

function formatarHistoricoTarefa(item: HistoricoItem): string {
  if (item.acao === "status_change" && item.detalhes) {
    const de = String(item.detalhes.de ?? "?");
    const para = String(item.detalhes.para ?? "?");
    return `Status alterado de "${TAREFA_STATUS_LABEL[de] ?? de}" para "${TAREFA_STATUS_LABEL[para] ?? para}"`;
  }
  if (item.acao === "excluida") return "Tarefa excluída";
  return item.acao;
}

function HistoricoTarefa({ tarefaId, podeVer }: { tarefaId: string; podeVer: boolean }) {
  const { itens, loading } = useHistorico("tarefas", tarefaId, podeVer);
  if (!podeVer || loading) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="size-4" />
          Histórico
        </CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">Nenhuma mudança registrada.</div>
        ) : (
          <ul className="space-y-2">
            {itens.map((item) => (
              <li key={item.id} className="text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>{formatarHistoricoTarefa(item)}</div>
                <div className="text-xs text-muted-foreground">
                  {item.autorNome ?? "Sistema"} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
