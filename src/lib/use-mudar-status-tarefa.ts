import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/lib/supabase/types";

type TarefaStatus = Database["public"]["Enums"]["tarefa_status"];

/**
 * Atualiza o status de uma tarefa e mantém tempo_registros em sincronia
 * (abre um registro ao iniciar, fecha o mais recente em aberto ao pausar
 * ou concluir). Usado em app.tarefas.$id.tsx, app.kanban.tsx e
 * app.minhas-tarefas.tsx — centralizado aqui pra não triplicar a lógica.
 */
export function useMudarStatusTarefa() {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function mudarStatus(
    tarefaId: string,
    statusAtual: string,
    novoStatus: TarefaStatus
  ): Promise<{ error: string | null }> {
    setBusyId(tarefaId);
    const patch: Database["public"]["Tables"]["tarefas"]["Update"] = { status: novoStatus };
    if (novoStatus === "em_andamento" && statusAtual !== "em_andamento") patch.iniciado_em = new Date().toISOString();
    if (novoStatus === "concluida") patch.finalizado_em = new Date().toISOString();

    const { error } = await supabase.from("tarefas").update(patch).eq("id", tarefaId);

    if (!error && user && (novoStatus === "em_andamento" || novoStatus === "concluida")) {
      if (novoStatus === "em_andamento") {
        await supabase.from("tempo_registros").insert({ tarefa_id: tarefaId, user_id: user.id });
      } else {
        const { data: aberto } = await supabase
          .from("tempo_registros")
          .select("id,inicio")
          .eq("tarefa_id", tarefaId)
          .is("fim", null)
          .order("inicio", { ascending: false })
          .limit(1)
          .maybeSingle();
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

    setBusyId(null);
    return { error: error?.message ?? null };
  }

  return { mudarStatus, busyId };
}
