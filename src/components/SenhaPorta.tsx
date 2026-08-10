import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

interface SenhaPortaProps {
  tarefaId: string;
  unidadeId: string;
  dataPrevista: string;
  senhaTarefa: string | null;
  senhaUnidade?: string | null;
  compact?: boolean;
}

/**
 * Mostra a senha da porta (da tarefa, com fallback pra da unidade) ou, se
 * nenhuma estiver cadastrada, um aviso com botão pra solicitar ao
 * administrador. Reaproveita a tabela `solicitacoes` (tipo 'senha_porta')
 * já usada pela tela de Alertas, em vez de um sistema de notificação novo.
 * Usado em app.kanban.tsx, app.minhas-tarefas.tsx e app.tarefas.$id.tsx.
 */
export function SenhaPorta({ tarefaId, unidadeId, dataPrevista, senhaTarefa, senhaUnidade, compact }: SenhaPortaProps) {
  const senha = senhaTarefa || senhaUnidade || null;

  if (senha) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded bg-warning/15 border border-warning/40 font-mono font-bold w-fit ${
          compact ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm"
        }`}
      >
        <KeyRound className={compact ? "size-3" : "size-4"} />
        {senha}
      </div>
    );
  }

  return <SolicitarSenhaPorta tarefaId={tarefaId} unidadeId={unidadeId} dataPrevista={dataPrevista} compact={compact} />;
}

function SolicitarSenhaPorta({
  tarefaId,
  unidadeId,
  dataPrevista,
  compact,
}: {
  tarefaId: string;
  unidadeId: string;
  dataPrevista: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [pendente, setPendente] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);

  const checar = useCallback(async () => {
    const { data } = await supabase
      .from("solicitacoes")
      .select("id")
      .eq("tarefa_id", tarefaId)
      .eq("tipo", "senha_porta")
      .eq("status", "pendente")
      .limit(1)
      .maybeSingle();
    setPendente(!!data);
  }, [tarefaId]);

  useEffect(() => {
    checar();
  }, [checar]);
  useRealtimeRefresh(["solicitacoes"], checar);

  async function solicitar() {
    setEnviando(true);
    const { error } = await supabase.from("solicitacoes").insert({
      unidade_id: unidadeId,
      tarefa_id: tarefaId,
      tipo: "senha_porta",
      status: "pendente",
      descricao: `Senha da porta não disponível para a tarefa de ${dataPrevista}`,
      criado_por: user?.id,
    });
    setEnviando(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação enviada ao administrador");
    setPendente(true);
  }

  if (pendente === null) return null;

  return (
    <div
      className={`flex items-center gap-1.5 flex-wrap rounded bg-warning/15 border border-warning/40 ${
        compact ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm"
      }`}
    >
      <KeyRound className={compact ? "size-3 shrink-0" : "size-4 shrink-0"} />
      <span className="flex-1 min-w-0">Senha da porta não disponível</span>
      {pendente ? (
        <span className="text-muted-foreground text-xs shrink-0">Aguardando resposta do administrador</span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className={compact ? "h-6 px-2 text-xs shrink-0" : "h-7 px-2.5 text-xs shrink-0"}
          onClick={solicitar}
          disabled={enviando}
        >
          Solicitar senha ao administrador
        </Button>
      )}
    </div>
  );
}
