import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES } from "@/lib/auth";
import { useResponsaveisDisponiveis } from "@/lib/use-responsaveis-disponiveis";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserPlus, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  user_id: string;
  nome_completo: string;
}

interface Props {
  tarefaId: string;
  tipo: string;
  vistoriadorId: string | null;
  camareiras: Profile[];
  onChange: () => void;
  bloqueado?: boolean;
}

/**
 * Atribui responsáveis a uma tarefa.
 * - Limpeza: 1 camareira responsável + 1 vistoriador previsto.
 * - Vistoria: 1 vistoriador.
 */
export function AtribuirResponsaveis({ tarefaId, tipo, vistoriadorId, camareiras, onChange, bloqueado }: Props) {
  const { hasAnyRole } = useAuth();
  const podeEditar = !bloqueado && hasAnyRole(FRONT_DESK_ROLES);
  const { camareiras: todosCamareiras, vistoriadores: todosVistoriadores, ehLimpeza, ehVistoria } = useResponsaveisDisponiveis(tipo, podeEditar);

  const [busy, setBusy] = useState(false);

  const camareiraAtual = camareiras[0] ?? null;

  /**
   * Define a camareira responsável (substitui qualquer camareira anterior).
   * Mantém `tarefa_camareiras` e `responsavel_id` em sincronia.
   */
  async function definirCamareira(uid: string) {
    setBusy(true);
    try {
      const { error: delErr } = await supabase.from("tarefa_camareiras").delete().eq("tarefa_id", tarefaId);
      if (delErr) throw delErr;

      let novoResponsavel: string | null = null;
      if (uid) {
        const { error: insErr } = await supabase.from("tarefa_camareiras").insert({ tarefa_id: tarefaId, user_id: uid });
        if (insErr) throw insErr;
        novoResponsavel = uid;
      }
      const { error: updErr } = await supabase.from("tarefas").update({ responsavel_id: novoResponsavel }).eq("id", tarefaId);
      if (updErr) throw updErr;
      toast.success(uid ? "Camareira atualizada" : "Camareira removida");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  async function definirVistoriador(uid: string) {
    setBusy(true);
    try {
      const valor = uid || null;
      const updates: { vistoriador_id: string | null; responsavel_id?: string | null } = { vistoriador_id: valor };
      if (ehVistoria) updates.responsavel_id = valor;
      const { error } = await supabase.from("tarefas").update(updates).eq("id", tarefaId);
      if (error) throw error;
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {ehLimpeza && (
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <UserPlus className="size-3.5" /> Camareira responsável
          </Label>
          {podeEditar ? (
            <Select value={camareiraAtual?.user_id ?? "__none__"} onValueChange={(v) => definirCamareira(v === "__none__" ? "" : v)} disabled={busy}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecionar camareira..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Sem camareira —</SelectItem>
                {todosCamareiras.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-sm">{camareiraAtual?.nome_completo ?? "—"}</div>
          )}
          {podeEditar && todosCamareiras.length === 0 && <div className="text-[11px] text-muted-foreground">Nenhum usuário com perfil "Camareira" cadastrado.</div>}
        </div>
      )}

      {(ehLimpeza || ehVistoria) && (
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <ClipboardCheck className="size-3.5" />
            {ehVistoria ? "Vistoriador" : "Vistoriador previsto"}
          </Label>
          {podeEditar ? (
            <Select value={vistoriadorId ?? "__none__"} onValueChange={(v) => definirVistoriador(v === "__none__" ? "" : v)} disabled={busy}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Sem vistoriador —</SelectItem>
                {todosVistoriadores.map((v) => (
                  <SelectItem key={v.user_id} value={v.user_id}>
                    {v.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-sm">{vistoriadorId ? (todosVistoriadores.find((v) => v.user_id === vistoriadorId)?.nome_completo ?? "—") : "—"}</div>
          )}
          {podeEditar && todosVistoriadores.length === 0 && <div className="text-[11px] text-muted-foreground">Nenhum usuário com perfil "Vistoriador" cadastrado.</div>}
        </div>
      )}
    </div>
  );
}
