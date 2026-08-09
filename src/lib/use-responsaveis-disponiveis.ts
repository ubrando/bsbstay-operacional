import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/auth";

export interface ResponsavelOpcao {
  user_id: string;
  nome_completo: string;
}

const LIMPEZA_TIPOS = ["limpeza_checkout", "limpeza_intermediaria"];

const dedupOrdenado = (xs: ResponsavelOpcao[]) =>
  Array.from(new Map(xs.map((x) => [x.user_id, x])).values()).sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));

/**
 * Carrega camareiras e vistoriadores ativos disponíveis para atribuir a um
 * tipo de tarefa. Compartilhado entre a atribuição na tela de detalhe
 * (AtribuirResponsaveis) e a escolha opcional já na criação da tarefa.
 */
export function useResponsaveisDisponiveis(tipo: string, habilitado = true) {
  const ehLimpeza = LIMPEZA_TIPOS.includes(tipo);
  const ehVistoria = tipo === "vistoria";

  const [camareiras, setCamareiras] = useState<ResponsavelOpcao[]>([]);
  const [vistoriadores, setVistoriadores] = useState<ResponsavelOpcao[]>([]);

  useEffect(() => {
    if (!habilitado) return;
    (async () => {
      const rolesNeeded: AppRole[] = ehLimpeza ? ["camareira", "vistoriador"] : ehVistoria ? ["vistoriador"] : [];
      if (rolesNeeded.length === 0) {
        setCamareiras([]);
        setVistoriadores([]);
        return;
      }
      const { data: ur } = await supabase.from("user_roles").select("user_id, role").in("role", rolesNeeded);
      const ids = [...new Set((ur ?? []).map((r) => r.user_id))];
      if (ids.length === 0) {
        setCamareiras([]);
        setVistoriadores([]);
        return;
      }
      const { data: profs } = await supabase.from("profiles").select("user_id, nome_completo, ativo").in("user_id", ids);
      const ativos = (profs ?? []).filter((p) => p.ativo);
      const byId = new Map(ativos.map((p) => [p.user_id, p.nome_completo]));
      setCamareiras(
        dedupOrdenado(
          (ur ?? []).filter((r) => r.role === "camareira" && byId.has(r.user_id)).map((r) => ({ user_id: r.user_id, nome_completo: byId.get(r.user_id)! }))
        )
      );
      setVistoriadores(
        dedupOrdenado(
          (ur ?? []).filter((r) => r.role === "vistoriador" && byId.has(r.user_id)).map((r) => ({ user_id: r.user_id, nome_completo: byId.get(r.user_id)! }))
        )
      );
    })();
  }, [habilitado, ehLimpeza, ehVistoria]);

  return { camareiras, vistoriadores, ehLimpeza, ehVistoria };
}
