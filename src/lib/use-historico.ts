import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";

const LIMITE = 30;

export interface HistoricoItem {
  id: string;
  acao: string;
  detalhes: Record<string, unknown> | null;
  createdAt: string;
  autorNome: string | null;
}

/** Lê audit_log pra um registro específico (tarefas ou unidades), com o
 *  nome de quem fez a mudança. RLS (ver_audit_log) já restringe a leitura
 *  a AUDITORIA_ROLES — `habilitado` evita a query pra quem não tem acesso. */
export function useHistorico(tabela: "tarefas" | "unidades", registroId: string, habilitado: boolean) {
  const [itens, setItens] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!habilitado) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_log")
      .select("id,acao,detalhes,created_at,user_id")
      .eq("tabela", tabela)
      .eq("registro_id", registroId)
      .order("created_at", { ascending: false })
      .limit(LIMITE);
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter((uid): uid is string => !!uid))];
    const { data: perfis } = userIds.length
      ? await supabase.from("profiles").select("user_id,nome_completo").in("user_id", userIds)
      : { data: [] as { user_id: string; nome_completo: string }[] };
    const nomeMap = new Map((perfis ?? []).map((p) => [p.user_id, p.nome_completo]));

    setItens(
      rows.map((r) => ({
        id: r.id,
        acao: r.acao,
        detalhes: r.detalhes,
        createdAt: r.created_at,
        autorNome: r.user_id ? (nomeMap.get(r.user_id) ?? null) : null,
      }))
    );
    setLoading(false);
  }, [tabela, registroId, habilitado]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(habilitado ? ["audit_log"] : [], load);

  return { itens, loading };
}
