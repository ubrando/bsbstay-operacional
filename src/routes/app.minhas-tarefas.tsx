import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, Play, Pause, CheckCircle2, KeyRound, ClipboardCheck } from "lucide-react";
import { TAREFA_TIPO_LABEL, PRIORIDADE_LABEL, PRIORIDADE_BORDA, statusBadgeVariant, TAREFA_STATUS_LABEL } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import { useDiaNavegacao, todayStr, shiftDay } from "@/lib/use-dia-navegacao";
import { useMudarStatusTarefa } from "@/lib/use-mudar-status-tarefa";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/minhas-tarefas")({
  component: MinhasTarefas,
});

type TarefaRow = {
  id: string;
  tipo: string;
  prioridade: string;
  status: string;
  hora_prevista: string | null;
  ordem_dia: number | null;
  unidade_id: string;
  senha_apartamento: string | null;
  responsavel_id: string | null;
  vistoriador_id: string | null;
};

type UnidadeRow = { id: string; codigo: string; nome: string };

const TODOS = "todos";

function MinhasTarefas() {
  const { user } = useAuth();
  const { dia, setDia, isHoje } = useDiaNavegacao();
  const { mudarStatus, busyId } = useMudarStatusTarefa();

  const [tarefas, setTarefas] = useState<TarefaRow[]>([]);
  const [unidades, setUnidades] = useState<Map<string, UnidadeRow>>(new Map());
  const [demandasPendentes, setDemandasPendentes] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState(TODOS);
  const [filtroPrioridade, setFiltroPrioridade] = useState(TODOS);
  const [filtroStatus, setFiltroStatus] = useState(TODOS);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: ts, error }, { data: camRows }] = await Promise.all([
      supabase
        .from("tarefas")
        .select("id,tipo,prioridade,status,hora_prevista,ordem_dia,unidade_id,senha_apartamento,responsavel_id,vistoriador_id")
        .eq("data_prevista", dia)
        .order("ordem_dia", { ascending: true, nullsFirst: false })
        .order("hora_prevista", { ascending: true }),
      supabase.from("tarefa_camareiras").select("tarefa_id").eq("user_id", user.id),
    ]);
    if (error) console.error(error);

    const camTarefaIds = new Set((camRows ?? []).map((c) => c.tarefa_id));
    const minhas = (ts ?? []).filter(
      (t) => t.responsavel_id === user.id || t.vistoriador_id === user.id || camTarefaIds.has(t.id)
    ) as TarefaRow[];

    const uIds = [...new Set(minhas.map((t) => t.unidade_id))];
    const tIds = minhas.map((t) => t.id);
    const [{ data: us }, { data: demandas }] = await Promise.all([
      uIds.length ? supabase.from("unidades").select("id,codigo,nome").in("id", uIds) : Promise.resolve({ data: [] as UnidadeRow[] }),
      tIds.length
        ? supabase.from("vistoria_demandas").select("tarefa_id,concluido").in("tarefa_id", tIds)
        : Promise.resolve({ data: [] as { tarefa_id: string; concluido: boolean }[] }),
    ]);

    const uMap = new Map<string, UnidadeRow>();
    (us ?? []).forEach((u) => uMap.set(u.id, u));
    const dMap = new Map<string, number>();
    (demandas ?? []).forEach((d) => {
      if (d.concluido) return;
      dMap.set(d.tarefa_id, (dMap.get(d.tarefa_id) ?? 0) + 1);
    });

    setUnidades(uMap);
    setDemandasPendentes(dMap);
    setTarefas(minhas);
    setLoading(false);
  }, [user, dia]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(["tarefas", "tarefa_camareiras", "vistoria_demandas"], load);

  const tarefasOrdenadas = useMemo(
    () =>
      tarefas
        .filter((t) => {
          if (filtroTipo !== TODOS && t.tipo !== filtroTipo) return false;
          if (filtroPrioridade !== TODOS && t.prioridade !== filtroPrioridade) return false;
          if (filtroStatus !== TODOS && t.status !== filtroStatus) return false;
          return true;
        })
        .sort((a, b) => {
          if (a.ordem_dia != null && b.ordem_dia != null) return a.ordem_dia - b.ordem_dia;
          if (a.ordem_dia != null) return -1;
          if (b.ordem_dia != null) return 1;
          return (a.hora_prevista ?? "").localeCompare(b.hora_prevista ?? "");
        }),
    [tarefas, filtroTipo, filtroPrioridade, filtroStatus]
  );

  async function onMudarStatus(t: TarefaRow, novo: Database["public"]["Enums"]["tarefa_status"]) {
    const { error } = await mudarStatus(t.id, t.status, novo);
    if (error) return toast.error(error);
    toast.success("Status atualizado");
    load();
  }

  return (
    <div className="max-w-lg mx-auto space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">Minhas tarefas</h1>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setDia(shiftDay(dia, -1))} aria-label="Dia anterior">
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <CalIcon className="size-4 text-muted-foreground shrink-0" />
          <Input type="date" value={dia} onChange={(e) => setDia(e.target.value || todayStr())} className="h-11" />
        </div>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setDia(shiftDay(dia, 1))} aria-label="Próximo dia">
          <ChevronRight className="size-5" />
        </Button>
      </div>
      {!isHoje && (
        <Button variant="ghost" size="sm" onClick={() => setDia(todayStr())} className="w-full">
          Voltar para hoje
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-10 flex-1 min-w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os tipos</SelectItem>
            {Object.entries(TAREFA_TIPO_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
          <SelectTrigger className="h-10 flex-1 min-w-[140px]">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as prioridades</SelectItem>
            {Object.entries(PRIORIDADE_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-10 flex-1 min-w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os status</SelectItem>
            {Object.entries(TAREFA_STATUS_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Carregando...</p>
      ) : tarefasOrdenadas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            {tarefas.length === 0 ? "Nenhuma tarefa sua para este dia." : "Nenhuma tarefa bate com os filtros."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {tarefasOrdenadas.map((t) => (
            <TarefaItem
              key={t.id}
              t={t}
              unidade={unidades.get(t.unidade_id)}
              demandasPendentes={demandasPendentes.get(t.id) ?? 0}
              busy={busyId === t.id}
              onMudarStatus={(novo) => onMudarStatus(t, novo)}
              dia={dia}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TarefaItem({
  t,
  unidade,
  demandasPendentes,
  busy,
  onMudarStatus,
  dia,
}: {
  t: TarefaRow;
  unidade?: UnidadeRow;
  demandasPendentes: number;
  busy: boolean;
  onMudarStatus: (novo: Database["public"]["Enums"]["tarefa_status"]) => void;
  dia: string;
}) {
  return (
    <Card className={`border-l-4 ${PRIORIDADE_BORDA[t.prioridade] ?? "border-l-muted-foreground/40"}`}>
      <CardContent className="p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{unidade?.nome ?? "—"}</div>
            <div className="text-xs text-muted-foreground truncate">
              {unidade?.codigo} · {TAREFA_TIPO_LABEL[t.tipo] ?? t.tipo}
              {t.hora_prevista && ` · ${t.hora_prevista.slice(0, 5)}`}
            </div>
          </div>
          <Badge variant={statusBadgeVariant(t.status)} className="shrink-0">
            {TAREFA_STATUS_LABEL[t.status] ?? t.status}
          </Badge>
        </div>

        {t.prioridade !== "media" && (
          <Badge variant="outline" className="text-xs">
            {PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade}
          </Badge>
        )}

        {t.senha_apartamento && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-warning/15 border border-warning/40 text-sm font-mono font-bold w-fit">
            <KeyRound className="size-4" />
            {t.senha_apartamento}
          </div>
        )}

        {demandasPendentes > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-warning">
            <ClipboardCheck className="size-4" />
            {demandasPendentes} demanda{demandasPendentes > 1 ? "s" : ""} de vistoria pendente{demandasPendentes > 1 ? "s" : ""}
          </div>
        )}

        <div className="flex gap-2 pt-0.5">
          {t.status !== "em_andamento" && t.status !== "concluida" && (
            <Button
              size="default"
              className="flex-1 h-10 transition-opacity duration-150 ease-out starting:opacity-0"
              onClick={() => onMudarStatus("em_andamento")}
              disabled={busy}
            >
              <Play className="size-4 mr-1" /> Iniciar
            </Button>
          )}
          {t.status === "em_andamento" && (
            <Button
              size="default"
              variant="outline"
              className="flex-1 h-10 transition-opacity duration-150 ease-out starting:opacity-0"
              onClick={() => onMudarStatus("pausada")}
              disabled={busy}
            >
              <Pause className="size-4 mr-1" /> Pausar
            </Button>
          )}
          {t.status !== "concluida" && (
            <Button
              size="default"
              variant="outline"
              className="flex-1 h-10 transition-opacity duration-150 ease-out starting:opacity-0"
              onClick={() => onMudarStatus("concluida")}
              disabled={busy}
            >
              <CheckCircle2 className="size-4 mr-1" /> Concluir
            </Button>
          )}
        </div>

        <Link to="/app/tarefas/$id" params={{ id: t.id }} search={{ from: "minhas-tarefas", dia }}>
          <Button variant="ghost" size="sm" className="w-full h-9">
            Ver detalhes
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
