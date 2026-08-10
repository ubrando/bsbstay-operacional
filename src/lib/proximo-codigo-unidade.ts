import { supabase } from "@/lib/supabase/client";

/**
 * unidades.codigo não tem um padrão fixo (dá pra cadastrar um código não
 * numérico manualmente) — só os puramente numéricos entram na sequência de
 * geração automática. Compartilhado entre app.unidades.nova.tsx e o
 * mini-formulário de unidade não registrada em app.importar.tsx, pra nunca
 * duplicar essa lógica.
 */
export function maiorCodigoNumerico(unidades: { codigo: string }[]): number {
  let maior = 0;
  for (const u of unidades) {
    if (/^\d+$/.test(u.codigo)) maior = Math.max(maior, Number(u.codigo));
  }
  return maior;
}

/**
 * Busca o maior código numérico já cadastrado e devolve `quantidade`
 * códigos sequenciais seguintes, prontos pra atribuir sem duplicar entre si
 * — útil pra lotes (as unidades não registradas de uma importação de CSV,
 * por exemplo), onde cada uma precisa do próximo número disponível
 * considerando também as outras já atribuídas no mesmo lote.
 */
export async function gerarProximosCodigos(quantidade: number): Promise<string[]> {
  const { data, error } = await supabase.from("unidades").select("codigo");
  if (error) throw error;
  let proximo = maiorCodigoNumerico(data ?? []) + 1;
  return Array.from({ length: quantidade }, () => String(proximo++));
}
