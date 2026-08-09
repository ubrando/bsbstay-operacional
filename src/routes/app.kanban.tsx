import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, MoreVertical, KeyRound, Bed, Users as UsersIcon, Moon, Hash, Plus } from "lucide-react";
import { TAREFA_TIPO_LABEL, PRIORIDADE_LABEL, PRIORIDADE_BORDA, TAREFA_STATUS_LABEL } from "@/lib/domain";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import { useDiaNavegacao, todayStr, shiftDay } from "@/lib/use-dia-navegacao";
import { useMudarStatusTarefa } from "@/lib/use-mudar-status-tarefa";
import { useResponsaveisDisponiveis } from "@/lib/use-responsaveis-disponiveis";

import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/kanban")({
  component: KanbanPage,
});

type TarefaRow = {
  id: string;
  tipo: string;
  prioridade: string;
  status: string;
  hora_prevista: string | null;
  responsavel_id: string | null;
  vistoriador_id: string | null;
  unidade_id: string;
  ordem_dia: number | null;
  montagem_cama: string | null;
  hospedes: number | null;
  noites: number | null;
  senha_apartamento: string | null;
  camareiras_ids?: string[];
};

type UnidadeRow = { id: string; codigo: string; nome: string };

// Colunas do Kanban (mapeamento status real → coluna visual)
type ColunaId = "pendente" | "em_limpeza" | "em_vistoria" | "concluida";
const COLUNAS: { id: ColunaId; label: string; tone: string }[] = [
  { id: "pendente", label: "Pendentes", tone: "border-warning/60 bg-warning/5" },
  { id: "em_limpeza", label: "Em limpeza", tone: "border-primary/60 bg-primary/5" },
  { id: "em_vistoria", label: "Em vistoria", tone: "border-accent/60 bg-accent/10" },
  { id: "concluida", label: "Concluídas", tone: "border-success/60 bg-success/5" },
];

function colunaDaTarefa(t: TarefaRow): ColunaId {
  if (t.status === "concluida") return "concluida";
  if (t.status === "pendente" || t.status === "pausada" || t.status === "cancelada") return "pendente";
  if (t.tipo === "vistoria") return "em_vistoria";
  return "em_limpeza";
}

function statusDaColuna(col: ColunaId): string {
  if (col === "pendente") return "pendente";
  if (col === "concluida") return "concluida";
  return "em_andamento";
}

function tarefaTemPessoa(t: TarefaRow, userId: string): boolean {
  return t.responsavel_id === userId || t.vistoriador_id === userId || (t.camareiras_ids ?? []).includes(userId);
}

const TODOS = "todos";

function KanbanPage() {
  const { user, hasAnyRole } = useAuth();
  const podeCriar = hasAnyRole(FRONT_DESK_ROLES);
  const { dia, setDia, isHoje } = useDiaNavegacao();
  const { mudarStatus: mudarStatusBase } = useMudarStatusTarefa();

  const [tarefas, setTarefas] = useState<TarefaRow[]>([]);
  const [unidades, setUnidades] = useState<Map<string, UnidadeRow>>(new Map());
  const [respMap, setRespMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState(TODOS);
  const [filtroPrioridade, setFiltroPrioridade] = useState(TODOS);
  const [filtroStatus, setFiltroStatus] = useState(TODOS);
  const [filtroResponsavel, setFiltroResponsavel] = useState(TODOS);
  const [dragId, setDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Reaproveita a mesma busca de camareiras/vistoriadores usada na criação
  // de tarefas — "limpeza_checkout" traz as duas listas (ver hook).
  const { camareiras, vistoriadores } = useResponsaveisDisponiveis("limpeza_checkout", true);
  const responsaveisOpcoes = useMemo(() => {
    const map = new Map<string, string>();
    [...camareiras, ...vistoriadores].forEach((r) => map.set(r.user_id, r.nome_completo));
    return [...map.entries()].map(([user_id, nome_completo]) => ({ user_id, nome_completo })).sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
  }, [camareiras, vistoriadores]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: ts, error } = await supabase
      .from("tarefas")
      .select("id,tipo,prioridade,status,hora_prevista,responsavel_id,vistoriador_id,unidade_id,ordem_dia,montagem_cama,hospedes,noites,senha_apartamento")
      .eq("data_prevista", dia)
      .order("ordem_dia", { ascending: true, nullsFirst: false })
      .order("hora_prevista", { ascending: true });
    if (error) console.error(error);
    const data = (ts ?? []) as TarefaRow[];
    const tIds = data.map((t) => t.id);
    const uIds = [...new Set(data.map((t) => t.unidade_id))];

    const { data: camRows } = tIds.length
      ? await supabase.from("tarefa_camareiras").select("tarefa_id,user_id").in("tarefa_id", tIds)
      : { data: [] as { tarefa_id: string; user_id: string }[] };
    const camMap = new Map<string, string[]>();
    (camRows ?? []).forEach((c) => {
      const arr = camMap.get(c.tarefa_id) ?? [];
      arr.push(c.user_id);
      camMap.set(c.tarefa_id, arr);
    });
    data.forEach((t) => {
      t.camareiras_ids = camMap.get(t.id) ?? [];
    });

    const rIds = new Set<string>();
    data.forEach((t) => {
      if (t.responsavel_id) rIds.add(t.responsavel_id);
      if (t.vistoriador_id) rIds.add(t.vistoriador_id);
      (t.camareiras_ids ?? []).forEach((id) => rIds.add(id));
    });

    const [{ data: us }, { data: ps }] = await Promise.all([
      uIds.length ? supabase.from("unidades").select("id,codigo,nome").in("id", uIds) : Promise.resolve({ data: [] as UnidadeRow[] }),
      rIds.size
        ? supabase.from("profiles").select("user_id,nome_completo").in("user_id", [...rIds])
        : Promise.resolve({ data: [] as { user_id: string; nome_completo: string }[] }),
    ]);
    const uMap = new Map<string, UnidadeRow>();
    (us ?? []).forEach((u) => uMap.set(u.id, u));
    const rMap = new Map<string, string>();
    (ps ?? []).forEach((p) => rMap.set(p.user_id, p.nome_completo));
    setUnidades(uMap);
    setRespMap(rMap);
    setTarefas(data);
    setLoading(false);
  }, [user, dia]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(["tarefas", "tarefa_camareiras", "unidades", "liberacoes"], load);

  const tarefasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return tarefas.filter((t) => {
      if (q) {
        const u = unidades.get(t.unidade_id);
        if (!u || !(u.nome.toLowerCase().includes(q) || u.codigo.toLowerCase().includes(q))) return false;
      }
      if (filtroTipo !== TODOS && t.tipo !== filtroTipo) return false;
      if (filtroPrioridade !== TODOS && t.prioridade !== filtroPrioridade) return false;
      if (filtroResponsavel !== TODOS && !tarefaTemPessoa(t, filtroResponsavel)) return false;
      // Status não filtra aqui de propósito — já é representado pelas colunas;
      // ver TarefaCard, que esmaece o card em vez de escondê-lo.
      return true;
    });
  }, [tarefas, filtro, unidades, filtroTipo, filtroPrioridade, filtroResponsavel]);

  const porColuna = useMemo(() => {
    const map = new Map<ColunaId, TarefaRow[]>();
    COLUNAS.forEach((c) => map.set(c.id, []));
    for (const t of tarefasFiltradas) map.get(colunaDaTarefa(t))!.push(t);
    return map;
  }, [tarefasFiltradas]);

  async function moverTarefa(id: string, novaColuna: ColunaId) {
    const t = tarefas.find((x) => x.id === id);
    if (!t) return;
    const colAtual = colunaDaTarefa(t);
    if (colAtual === novaColuna) return;
    const novoStatus = statusDaColuna(novaColuna);
    if (novoStatus === t.status) return;

    // Otimista
    setTarefas((prev) => prev.map((x) => (x.id === id ? { ...x, status: novoStatus } : x)));
    const { error } = await mudarStatusBase(id, t.status, novoStatus as Database["public"]["Enums"]["tarefa_status"]);
    if (error) {
      setTarefas((prev) => prev.map((x) => (x.id === id ? { ...x, status: t.status } : x)));
      toast.error("Não foi possível mover: " + error);
    } else {
      toast.success("Tarefa movida");
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const overId = e.over?.id as string | undefined;
    const id = e.active.id as string;
    if (!overId) return;
    if (!COLUNAS.find((c) => c.id === overId)) return;
    moverTarefa(id, overId as ColunaId);
  }

  const tarefaAtiva = dragId ? tarefas.find((t) => t.id === dragId) : null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Kanban do dia</h1>
          <p className="text-muted-foreground text-sm">Arraste tarefas entre colunas ou use o menu</p>
        </div>
        <div className="flex items-center gap-2">
          {podeCriar && (
            <Link to="/app/tarefas/nova">
              <Button size="sm">
                <Plus className="size-4" />
                Nova tarefa
              </Button>
            </Link>
          )}
          <Link to="/app">
            <Button variant="outline" size="sm">
              Voltar ao painel
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDia(shiftDay(dia, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <CalIcon className="size-4 text-muted-foreground" />
          <Input type="date" value={dia} onChange={(e) => setDia(e.target.value || todayStr())} className="h-10" />
        </div>
        <Button variant="outline" size="icon" onClick={() => setDia(shiftDay(dia, 1))}>
          <ChevronRight className="size-4" />
        </Button>
        {!isHoje && (
          <Button variant="ghost" size="sm" onClick={() => setDia(todayStr())}>
            Hoje
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Filtrar por unidade..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-10 flex-1 min-w-[180px]" />
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-10 w-auto min-w-[140px]">
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
          <SelectTrigger className="h-10 w-auto min-w-[140px]">
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
          <SelectTrigger className="h-10 w-auto min-w-[140px]">
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
        <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
          <SelectTrigger className="h-10 w-auto min-w-[160px]">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
            {responsaveisOpcoes.map((r) => (
              <SelectItem key={r.user_id} value={r.user_id}>
                {r.nome_completo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Carregando...</p>
      ) : tarefas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Nenhuma tarefa para este dia.</CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setDragId(e.active.id as string)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragId(null)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {COLUNAS.map((col) => (
              <Coluna
                key={col.id}
                col={col}
                tarefas={porColuna.get(col.id) ?? []}
                unidades={unidades}
                respMap={respMap}
                onMover={moverTarefa}
                filtroStatus={filtroStatus}
                dia={dia}
              />
            ))}
          </div>
          <DragOverlay>
            {tarefaAtiva ? (
              <div className="opacity-90 rotate-2">
                <TarefaCard t={tarefaAtiva} unidade={unidades.get(tarefaAtiva.unidade_id)} respMap={respMap} filtroStatus={filtroStatus} dia={dia} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Coluna({
  col,
  tarefas,
  unidades,
  respMap,
  onMover,
  filtroStatus,
  dia,
}: {
  col: { id: ColunaId; label: string; tone: string };
  tarefas: TarefaRow[];
  unidades: Map<string, UnidadeRow>;
  respMap: Map<string, string>;
  onMover: (id: string, c: ColunaId) => void;
  filtroStatus: string;
  dia: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div ref={setNodeRef} className={`rounded-xl border-2 ${col.tone} p-2 min-h-[200px] transition ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between px-2 py-1 mb-2">
        <h2 className="font-bold text-sm">{col.label}</h2>
        <Badge variant="outline" className="text-xs">
          {tarefas.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {tarefas.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">—</div>
        ) : (
          tarefas.map((t) => (
            <DraggableCard key={t.id} t={t} unidade={unidades.get(t.unidade_id)} respMap={respMap} onMover={onMover} filtroStatus={filtroStatus} dia={dia} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  t,
  unidade,
  respMap,
  onMover,
  filtroStatus,
  dia,
}: {
  t: TarefaRow;
  unidade?: UnidadeRow;
  respMap: Map<string, string>;
  onMover: (id: string, c: ColunaId) => void;
  filtroStatus: string;
  dia: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id });
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }} {...attributes} {...listeners}>
      <TarefaCard t={t} unidade={unidade} respMap={respMap} onMover={onMover} filtroStatus={filtroStatus} dia={dia} />
    </div>
  );
}

function TarefaCard({
  t,
  unidade,
  respMap,
  onMover,
  filtroStatus,
  dia,
  dragging,
}: {
  t: TarefaRow;
  unidade?: UnidadeRow;
  respMap: Map<string, string>;
  onMover?: (id: string, c: ColunaId) => void;
  filtroStatus: string;
  dia: string;
  dragging?: boolean;
}) {
  const ehLimpeza = t.tipo === "limpeza_checkout" || t.tipo === "limpeza_intermediaria";
  const camNomes = (t.camareiras_ids ?? []).map((id) => respMap.get(id) ?? "Camareira");
  const vistNome = t.vistoriador_id ? respMap.get(t.vistoriador_id) : null;
  let resp = "";
  if (ehLimpeza) resp = camNomes.length ? camNomes.join(", ") : "Sem camareira";
  else if (t.tipo === "vistoria") resp = vistNome ?? "Sem vistoriador";
  else resp = t.responsavel_id ? (respMap.get(t.responsavel_id) ?? "Responsável") : "Sem responsável";

  const destacada = filtroStatus === TODOS || t.status === filtroStatus;

  return (
    <Card
      className={`bg-background border-l-4 ${PRIORIDADE_BORDA[t.prioridade] ?? "border-l-muted-foreground/40"} ${dragging ? "shadow-2xl" : "shadow-sm"} touch-none ${destacada ? "" : "opacity-40"}`}
    >
      <CardContent className="p-2.5 space-y-1.5">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{unidade?.nome ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {TAREFA_TIPO_LABEL[t.tipo] ?? t.tipo}
              {t.hora_prevista && ` · ${t.hora_prevista.slice(0, 5)}`}
              {t.prioridade !== "media" && ` · ${PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade}`}
            </div>
          </div>
          {onMover && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 -m-1 rounded hover:bg-accent shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Ações"
                >
                  <MoreVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Mover para</DropdownMenuLabel>
                {COLUNAS.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => onMover(t.id, c.id)}>
                    {c.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <Link to="/app/tarefas/$id" params={{ id: t.id }} search={{ from: "kanban", dia }}>
                  <DropdownMenuItem>Abrir tarefa</DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground truncate">{resp}</div>

        <div className="flex flex-wrap gap-1 text-[10px]">
          {t.ordem_dia != null && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted">
              <Hash className="size-3" />
              {t.ordem_dia}
            </span>
          )}
          {t.montagem_cama && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted">
              <Bed className="size-3" />
              {t.montagem_cama}
            </span>
          )}
          {t.hospedes != null && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted">
              <UsersIcon className="size-3" />
              {t.hospedes}
            </span>
          )}
          {t.noites != null && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted">
              <Moon className="size-3" />
              {t.noites}n
            </span>
          )}
        </div>

        {t.senha_apartamento && (
          <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-warning/15 border border-warning/40 text-xs font-mono font-bold">
            <KeyRound className="size-3" />
            {t.senha_apartamento}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
