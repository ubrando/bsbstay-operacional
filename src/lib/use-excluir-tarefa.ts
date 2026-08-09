import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

/** Exclusão de tarefa (RLS já restringe a OPERATOR_ROLES via admin_deleta_tarefas).
 *  Usado em app.kanban.tsx e app.tarefas.$id.tsx pra não duplicar a chamada. */
export function useExcluirTarefa() {
  const [excluindo, setExcluindo] = useState(false);

  async function excluirTarefa(tarefaId: string): Promise<{ error: string | null }> {
    setExcluindo(true);
    const { error } = await supabase.from("tarefas").delete().eq("id", tarefaId);
    setExcluindo(false);
    return { error: error?.message ?? null };
  }

  return { excluirTarefa, excluindo };
}
