import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, METRICAS_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TAREFA_TIPO_LABEL, formatMin } from "@/lib/domain";
import { toast } from "sonner";

export const Route = createFileRoute("/app/metricas")({
  component: Metricas,
});

const LIMPEZA_TIPOS = ["limpeza_checkout", "limpeza_intermediaria"];
const TOP_N_UNIDADES_ATRASO = 8;
const TAMANHO_LOTE = 200;

type Periodo = "hoje" | "7d" | "30d";

const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

type UnidadeRow = { id: string; codigo: string; nome: string };

interface RankingItem {
  id: string;
  label: string;
  valor: number;
}

interface MetricasData {
  total: number;
  concluidas: number;
  tempoMedioLimpezaMin: number | null;
  amostrasTempoLimpeza: number;
  porTipo: RankingItem[];
  porCamareira: RankingItem[];
  unidadesAtraso: RankingItem[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDay(d: string, delta: number): string {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function horaLocalDe(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 8);
}

function periodoRange(periodo: Periodo): { inicio: string; fim: string } {
  const hoje = todayStr();
  if (periodo === "hoje") return { inicio: hoje, fim: hoje };
  if (periodo === "7d") return { inicio: shiftDay(hoje, -6), fim: hoje };
  return { inicio: shiftDay(hoje, -29), fim: hoje };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function Metricas() {
  const { hasAnyRole } = useAuth();
  const podeVer = hasAnyRole(METRICAS_ROLES);

  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [dados, setDados] = useState<MetricasData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!podeVer) return;
    setLoading(true);
    const { inicio, fim } = periodoRange(periodo);

    // Único ponto de corte por data no banco — tudo abaixo deriva desta lista,
    // já limitada ao período selecionado (nunca ao histórico completo).
    const { data: tarefas, error } = await supabase
      .from("tarefas")
      .select("id,tipo,status,hora_prevista,finalizado_em,unidade_id")
      .gte("data_prevista", inicio)
      .lte("data_prevista", fim);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const ts = tarefas ?? [];

    const total = ts.length;
    const concluidas = ts.filter((t) => t.status === "concluida");

    const porTipoMap = new Map<string, number>();
    ts.forEach((t) => porTipoMap.set(t.tipo, (porTipoMap.get(t.tipo) ?? 0) + 1));
    const porTipo: RankingItem[] = Object.entries(TAREFA_TIPO_LABEL)
      .map(([tipo, label]) => ({ id: tipo, label, valor: porTipoMap.get(tipo) ?? 0 }))
      .sort((a, b) => b.valor - a.valor);

    const porUnidadeAtrasoMap = new Map<string, number>();
    ts.forEach((t) => {
      const atrasada =
        t.status !== "concluida" ? true : !!(t.hora_prevista && t.finalizado_em && t.hora_prevista < horaLocalDe(t.finalizado_em));
      if (atrasada) porUnidadeAtrasoMap.set(t.unidade_id, (porUnidadeAtrasoMap.get(t.unidade_id) ?? 0) + 1);
    });
    const rankingAtrasoIds = [...porUnidadeAtrasoMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N_UNIDADES_ATRASO);

    const idsLimpeza = ts.filter((t) => LIMPEZA_TIPOS.includes(t.tipo)).map((t) => t.id);
    const duracoes: number[] = [];
    for (const lote of chunk(idsLimpeza, TAMANHO_LOTE)) {
      const { data } = await supabase.from("tempo_registros").select("duracao_min").in("tarefa_id", lote).not("duracao_min", "is", null);
      (data ?? []).forEach((d) => {
        if (d.duracao_min != null) duracoes.push(d.duracao_min);
      });
    }
    const tempoMedioLimpezaMin = duracoes.length ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : null;

    const idsConcluidas = concluidas.map((t) => t.id);
    const contagemPorCamareira = new Map<string, number>();
    for (const lote of chunk(idsConcluidas, TAMANHO_LOTE)) {
      const { data } = await supabase.from("tarefa_camareiras").select("tarefa_id,user_id").in("tarefa_id", lote);
      (data ?? []).forEach((r) => contagemPorCamareira.set(r.user_id, (contagemPorCamareira.get(r.user_id) ?? 0) + 1));
    }

    const idsUnidadesInfo = [...new Set([...rankingAtrasoIds.map(([id]) => id)])];
    const idsUsuarios = [...contagemPorCamareira.keys()];
    const [{ data: unidadesInfo }, { data: perfis }] = await Promise.all([
      idsUnidadesInfo.length ? supabase.from("unidades").select("id,codigo,nome").in("id", idsUnidadesInfo) : Promise.resolve({ data: [] as UnidadeRow[] }),
      idsUsuarios.length
        ? supabase.from("profiles").select("user_id,nome_completo").in("user_id", idsUsuarios)
        : Promise.resolve({ data: [] as { user_id: string; nome_completo: string }[] }),
    ]);
    const unidadeMap = new Map((unidadesInfo ?? []).map((u) => [u.id, u]));
    const nomeMap = new Map((perfis ?? []).map((p) => [p.user_id, p.nome_completo]));

    const unidadesAtraso: RankingItem[] = rankingAtrasoIds.map(([id, valor]) => {
      const u = unidadeMap.get(id);
      return { id, label: u ? `${u.nome} · ${u.codigo}` : "—", valor };
    });
    const porCamareira: RankingItem[] = idsUsuarios
      .map((id) => ({ id, label: nomeMap.get(id) ?? "—", valor: contagemPorCamareira.get(id)! }))
      .sort((a, b) => b.valor - a.valor);

    setDados({
      total,
      concluidas: concluidas.length,
      tempoMedioLimpezaMin,
      amostrasTempoLimpeza: duracoes.length,
      porTipo,
      porCamareira,
      unidadesAtraso,
    });
    setLoading(false);
  }, [podeVer, periodo]);

  useEffect(() => {
    load();
  }, [load]);

  if (!podeVer) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-3">
        <p className="text-sm text-muted-foreground">Você não tem permissão para ver as métricas.</p>
        <Link to="/app">
          <Button variant="outline" size="sm">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const pctConcluidas = dados && dados.total > 0 ? Math.round((dados.concluidas / dados.total) * 100) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Métricas</h1>
          <p className="text-sm text-muted-foreground">Indicadores da operação no período</p>
        </div>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="h-10 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(PERIODO_LABEL) as [Periodo, string][]).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading || !dados ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 space-y-1.5">
                <div className="text-xs text-muted-foreground">Tarefas concluídas</div>
                <div className="text-3xl font-semibold">{pctConcluidas != null ? `${pctConcluidas}%` : "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {dados.concluidas} de {dados.total}
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-r-sm bg-primary" style={{ width: `${pctConcluidas ?? 0}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1.5">
                <div className="text-xs text-muted-foreground">Tempo médio de limpeza</div>
                <div className="text-3xl font-semibold">{formatMin(dados.tempoMedioLimpezaMin)}</div>
                <div className="text-xs text-muted-foreground">
                  {dados.amostrasTempoLimpeza > 0 ? `com base em ${dados.amostrasTempoLimpeza} registro(s)` : "sem registros no período"}
                </div>
              </CardContent>
            </Card>
          </div>

          <SecaoRanking titulo="Tarefas por tipo" itens={dados.porTipo} vazio="Nenhuma tarefa no período." />
          <SecaoRanking
            titulo="Tarefas concluídas por camareira"
            itens={dados.porCamareira}
            vazio="Nenhuma tarefa concluída com camareira no período."
          />
          <SecaoRanking
            titulo="Unidades com mais atrasos"
            itens={dados.unidadesAtraso}
            vazio="Nenhum atraso no período."
            tom="warning"
          />
        </>
      )}
    </div>
  );
}

function SecaoRanking({
  titulo,
  itens,
  vazio,
  tom = "primary",
}: {
  titulo: string;
  itens: RankingItem[];
  vazio: string;
  tom?: "primary" | "warning";
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const comValor = itens.filter((i) => i.valor > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {comValor.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">{vazio}</div>
        ) : (
          comValor.map((item) => <BarraRanking key={item.id} label={item.label} valor={item.valor} max={max} tom={tom} />)
        )}
      </CardContent>
    </Card>
  );
}

function BarraRanking({ label, valor, max, tom }: { label: string; valor: number; max: number; tom: "primary" | "warning" }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  const cor = tom === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="font-semibold tabular-nums shrink-0">{valor}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-r-sm ${cor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
