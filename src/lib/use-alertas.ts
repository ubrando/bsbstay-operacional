import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";

/** Janela de "check-in próximo" — tarefas de limpeza com hora_prevista dentro
 *  dessa quantidade de horas a partir de agora entram no alerta. */
export const JANELA_PROXIMO_HORAS = 2;

/** Solicitações pendentes mais antigas que isso não entram no alerta — evita
 *  consulta sem limite de data (regra de performance do CLAUDE.md). */
const JANELA_SOLICITACOES_DIAS = 14;

const LIMPEZA_TIPOS = ["limpeza_checkout", "limpeza_intermediaria"];

type UnidadeRow = { id: string; codigo: string; nome: string };

export interface AlertaTarefa {
  id: string;
  unidadeId: string;
  unidade?: UnidadeRow;
  tipo: string;
  horaPrevista: string;
}

export interface AlertaSolicitacao {
  id: string;
  unidadeId: string;
  unidade?: UnidadeRow;
  tipo: string;
  descricao: string | null;
  createdAt: string;
}

export interface AlertasData {
  atrasadas: AlertaTarefa[];
  proximas: AlertaTarefa[];
  aguardandoLiberacao: UnidadeRow[];
  solicitacoesPendentes: AlertaSolicitacao[];
  loading: boolean;
  total: number;
  reload: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDay(d: string, delta: number): string {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function horaStr(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

/**
 * Calcula os alertas do dia a partir dos dados existentes (tarefas, unidades,
 * liberacoes, solicitacoes) — não há tabela própria de alertas. `habilitado`
 * evita rodar as consultas para quem não tem role pra ver a tela (ex: quando
 * chamado só pelo badge de contagem no AppShell).
 */
export function useAlertas(habilitado: boolean): AlertasData {
  const [atrasadas, setAtrasadas] = useState<AlertaTarefa[]>([]);
  const [proximas, setProximas] = useState<AlertaTarefa[]>([]);
  const [aguardandoLiberacao, setAguardandoLiberacao] = useState<UnidadeRow[]>([]);
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<AlertaSolicitacao[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!habilitado) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const hoje = todayStr();
    const agora = new Date();
    const horaAgora = horaStr(agora);
    const horaLimite = horaStr(new Date(agora.getTime() + JANELA_PROXIMO_HORAS * 3600_000));

    const [{ data: tarefasHoje }, { data: unidadesAguardandoIds }, { data: solicitacoes }] = await Promise.all([
      supabase
        .from("tarefas")
        .select("id,tipo,status,hora_prevista,unidade_id")
        .eq("data_prevista", hoje)
        .not("hora_prevista", "is", null)
        .neq("status", "concluida")
        .neq("status", "cancelada"),
      supabase.from("unidades").select("id").eq("status", "aguardando_liberacao"),
      supabase
        .from("solicitacoes")
        .select("id,tipo,descricao,unidade_id,created_at")
        .eq("status", "pendente")
        .gte("data_referencia", shiftDay(hoje, -JANELA_SOLICITACOES_DIAS))
        .order("created_at", { ascending: true }),
    ]);

    const idsAguardando = (unidadesAguardandoIds ?? []).map((u) => u.id);
    const { data: liberacoesHoje } = idsAguardando.length
      ? await supabase.from("liberacoes").select("unidade_id").eq("data_referencia", hoje).in("unidade_id", idsAguardando)
      : { data: [] as { unidade_id: string }[] };
    const liberadasHoje = new Set((liberacoesHoje ?? []).map((l) => l.unidade_id));
    const idsSemLiberacao = idsAguardando.filter((id) => !liberadasHoje.has(id));

    const atrasadasBrutas = (tarefasHoje ?? []).filter((t) => t.hora_prevista! < horaAgora);
    const proximasBrutas = (tarefasHoje ?? []).filter(
      (t) => t.hora_prevista! >= horaAgora && t.hora_prevista! <= horaLimite && LIMPEZA_TIPOS.includes(t.tipo)
    );

    const idsUnidades = new Set<string>(idsSemLiberacao);
    atrasadasBrutas.forEach((t) => idsUnidades.add(t.unidade_id));
    proximasBrutas.forEach((t) => idsUnidades.add(t.unidade_id));
    (solicitacoes ?? []).forEach((s) => idsUnidades.add(s.unidade_id));

    const { data: unidades } = idsUnidades.size
      ? await supabase.from("unidades").select("id,codigo,nome").in("id", [...idsUnidades])
      : { data: [] as UnidadeRow[] };
    const uMap = new Map((unidades ?? []).map((u) => [u.id, u]));

    setAtrasadas(
      atrasadasBrutas.map((t) => ({ id: t.id, unidadeId: t.unidade_id, unidade: uMap.get(t.unidade_id), tipo: t.tipo, horaPrevista: t.hora_prevista! }))
    );
    setProximas(
      proximasBrutas.map((t) => ({ id: t.id, unidadeId: t.unidade_id, unidade: uMap.get(t.unidade_id), tipo: t.tipo, horaPrevista: t.hora_prevista! }))
    );
    setAguardandoLiberacao(idsSemLiberacao.map((id) => uMap.get(id)).filter((u): u is UnidadeRow => !!u));
    setSolicitacoesPendentes(
      (solicitacoes ?? []).map((s) => ({
        id: s.id,
        unidadeId: s.unidade_id,
        unidade: uMap.get(s.unidade_id),
        tipo: s.tipo,
        descricao: s.descricao,
        createdAt: s.created_at,
      }))
    );
    setLoading(false);
  }, [habilitado]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(habilitado ? ["tarefas", "unidades", "liberacoes", "solicitacoes"] : [], load);

  const total = atrasadas.length + proximas.length + aguardandoLiberacao.length + solicitacoesPendentes.length;

  return { atrasadas, proximas, aguardandoLiberacao, solicitacoesPendentes, loading, total, reload: load };
}
