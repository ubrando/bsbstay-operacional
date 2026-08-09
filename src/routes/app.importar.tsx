import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/importar")({
  component: ImportarReservas,
});

const TAMANHO_LOTE = 50;

// Aceita variações comuns de cabeçalho (export do Ayrton não tem um padrão
// fixo documentado) — normaliza pra minúsculo/sem acento antes de comparar.
const CAMPO_ALIASES: Record<string, string[]> = {
  unidade_codigo: ["unidade_codigo", "codigo", "codigo_unidade", "unidade"],
  checkout: ["checkout", "data_checkout", "data_prevista", "data_check_out"],
  reserva_numero: ["reserva_numero", "reserva", "numero_reserva", "n_reserva", "codigo_reserva"],
  hospedes: ["hospedes", "n_hospedes", "numero_hospedes", "hospede"],
  noites: ["noites", "n_noites", "numero_noites"],
};

function normalizarChave(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_");
}

function valorDoCampo(row: Record<string, string>, campo: keyof typeof CAMPO_ALIASES): string {
  for (const alias of CAMPO_ALIASES[campo]) {
    const v = row[alias];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return "";
}

function parseDataCheckout(raw: string): string | null {
  let y: number, mo: number, d: number;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
  } else if (br) {
    d = Number(br[1]);
    mo = Number(br[2]);
    y = Number(br[3]);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseInteiroOpcional(raw: string): { valor: number | null; ok: boolean } {
  if (!raw) return { valor: null, ok: true };
  if (!/^\d+$/.test(raw)) return { valor: null, ok: false };
  return { valor: Number(raw), ok: true };
}

type LinhaValida = {
  linha: number;
  unidadeCodigo: string;
  unidadeId: string;
  unidadeNome: string;
  reservaNumero: string;
  dataPrevista: string;
  hospedes: number | null;
  noites: number | null;
  acao: "criar" | "atualizar";
  tarefaExistenteId?: string;
};

type LinhaErro = {
  linha: number;
  motivos: string[];
};

type Resultado = {
  criadas: number;
  atualizadas: number;
  jaImportadas: string[];
  falhas: string[];
};

const UNIQUE_VIOLATION = "23505";

function paraInsert(l: LinhaValida, criadoPor: string | undefined): Database["public"]["Tables"]["tarefas"]["Insert"] {
  return {
    unidade_id: l.unidadeId,
    tipo: "limpeza_checkout",
    data_prevista: l.dataPrevista,
    reserva_numero: l.reservaNumero,
    hospedes: l.hospedes,
    noites: l.noites,
    criado_por: criadoPor,
  };
}

function ImportarReservas() {
  const { user, hasAnyRole } = useAuth();
  const podeImportar = hasAnyRole(FRONT_DESK_ROLES);

  const inputRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [processando, setProcessando] = useState(false);
  const [linhasValidas, setLinhasValidas] = useState<LinhaValida[]>([]);
  const [linhasErro, setLinhasErro] = useState<LinhaErro[]>([]);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [confirmandoAberto, setConfirmandoAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  if (!podeImportar) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-3">
        <p className="text-sm text-muted-foreground">Você não tem permissão para importar reservas.</p>
        <Link to="/app/kanban">
          <Button variant="outline" size="sm">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  function limparPreview() {
    setLinhasValidas([]);
    setLinhasErro([]);
    setTotalLinhas(0);
    setResultado(null);
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setNomeArquivo(file.name);
    limparPreview();
    setProcessando(true);

    try {
      const Papa = (await import("papaparse")).default;
      const resultadoParse = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizarChave,
          complete: resolve,
          error: reject,
        });
      });

      const linhasBrutas = resultadoParse.data;
      setTotalLinhas(linhasBrutas.length);

      const { data: unidades, error: unidadesErro } = await supabase.from("unidades").select("id,codigo,nome");
      if (unidadesErro) throw unidadesErro;
      const unidadePorCodigo = new Map((unidades ?? []).map((u) => [u.codigo.trim().toUpperCase(), u]));

      const erros: LinhaErro[] = [];
      const candidatas: Omit<LinhaValida, "acao" | "tarefaExistenteId">[] = [];
      const reservasVistas = new Map<string, number>();

      linhasBrutas.forEach((row, i) => {
        const linha = i + 2; // +1 pelo cabeçalho, +1 pela indexação em 1
        const motivos: string[] = [];

        const unidadeCodigo = valorDoCampo(row, "unidade_codigo");
        const unidade = unidadeCodigo ? unidadePorCodigo.get(unidadeCodigo.toUpperCase()) : undefined;
        if (!unidadeCodigo) motivos.push("Código da unidade ausente");
        else if (!unidade) motivos.push(`Unidade não encontrada: "${unidadeCodigo}"`);

        const reservaNumero = valorDoCampo(row, "reserva_numero");
        if (!reservaNumero) motivos.push("Número da reserva ausente");
        else if (reservasVistas.has(reservaNumero)) {
          motivos.push(`Reserva duplicada nesta planilha (já aparece na linha ${reservasVistas.get(reservaNumero)})`);
        }

        const checkoutRaw = valorDoCampo(row, "checkout");
        const dataPrevista = checkoutRaw ? parseDataCheckout(checkoutRaw) : null;
        if (!checkoutRaw) motivos.push("Data de check-out ausente");
        else if (!dataPrevista) motivos.push(`Data de check-out inválida: "${checkoutRaw}"`);

        const { valor: hospedes, ok: hospedesOk } = parseInteiroOpcional(valorDoCampo(row, "hospedes"));
        if (!hospedesOk) motivos.push("Número de hóspedes inválido");

        const { valor: noites, ok: noitesOk } = parseInteiroOpcional(valorDoCampo(row, "noites"));
        if (!noitesOk) motivos.push("Número de noites inválido");

        if (motivos.length > 0) {
          erros.push({ linha, motivos });
          return;
        }

        if (reservaNumero) reservasVistas.set(reservaNumero, linha);
        candidatas.push({
          linha,
          unidadeCodigo,
          unidadeId: unidade!.id,
          unidadeNome: unidade!.nome,
          reservaNumero,
          dataPrevista: dataPrevista!,
          hospedes,
          noites,
        });
      });

      // Verifica reservas já existentes em lotes (evita URL enorme num .in() só).
      const existentesPorReserva = new Map<string, string>();
      const numerosReserva = candidatas.map((c) => c.reservaNumero);
      for (let i = 0; i < numerosReserva.length; i += 200) {
        const lote = numerosReserva.slice(i, i + 200);
        if (lote.length === 0) continue;
        const { data, error } = await supabase.from("tarefas").select("id,reserva_numero").in("reserva_numero", lote);
        if (error) throw error;
        for (const t of data ?? []) {
          if (t.reserva_numero) existentesPorReserva.set(t.reserva_numero, t.id);
        }
      }

      const validas: LinhaValida[] = candidatas.map((c) => {
        const existenteId = existentesPorReserva.get(c.reservaNumero);
        return existenteId
          ? { ...c, acao: "atualizar", tarefaExistenteId: existenteId }
          : { ...c, acao: "criar" };
      });

      setLinhasValidas(validas);
      setLinhasErro(erros);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar o arquivo.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarImportacao() {
    setImportando(true);
    const falhas: string[] = [];
    const jaImportadas: string[] = [];
    let criadas = 0;
    let atualizadas = 0;

    const paraCriar = linhasValidas.filter((l) => l.acao === "criar");
    const paraAtualizar = linhasValidas.filter((l) => l.acao === "atualizar");

    for (let i = 0; i < paraCriar.length; i += TAMANHO_LOTE) {
      const lote = paraCriar.slice(i, i + TAMANHO_LOTE);
      const { error } = await supabase.from("tarefas").insert(lote.map((l) => paraInsert(l, user?.id)));
      if (!error) {
        criadas += lote.length;
        continue;
      }
      if (error.code !== UNIQUE_VIOLATION) {
        falhas.push(`Lote de criação (linhas ${lote[0].linha}-${lote[lote.length - 1].linha}): ${error.message}`);
        continue;
      }
      // Alguém importou a mesma reserva em paralelo e o índice único recusou
      // o lote inteiro (INSERT com múltiplas linhas é uma transação só).
      // Refaz linha a linha pra isolar exatamente qual reserva colidiu, sem
      // descartar o resto do lote.
      const resultadosLinha = await Promise.all(lote.map((l) => supabase.from("tarefas").insert(paraInsert(l, user?.id))));
      resultadosLinha.forEach((r, idx) => {
        const l = lote[idx];
        if (!r.error) criadas++;
        else if (r.error.code === UNIQUE_VIOLATION) jaImportadas.push(`Linha ${l.linha} (reserva ${l.reservaNumero})`);
        else falhas.push(`Linha ${l.linha} (reserva ${l.reservaNumero}): ${r.error.message}`);
      });
    }

    for (let i = 0; i < paraAtualizar.length; i += TAMANHO_LOTE) {
      const lote = paraAtualizar.slice(i, i + TAMANHO_LOTE);
      const resultadosLote = await Promise.all(
        lote.map((l) =>
          supabase
            .from("tarefas")
            .update({ unidade_id: l.unidadeId, data_prevista: l.dataPrevista, hospedes: l.hospedes, noites: l.noites })
            .eq("id", l.tarefaExistenteId!)
        )
      );
      resultadosLote.forEach((r, idx) => {
        if (r.error) falhas.push(`Linha ${lote[idx].linha} (reserva ${lote[idx].reservaNumero}): ${r.error.message}`);
        else atualizadas++;
      });
    }

    setImportando(false);
    setConfirmandoAberto(false);
    setResultado({ criadas, atualizadas, jaImportadas, falhas });
    if (falhas.length > 0) toast.error(`Importação concluída com ${falhas.length} falha(s). Veja o resumo.`);
    else if (jaImportadas.length > 0)
      toast.success(`Importação concluída: ${criadas} criadas, ${atualizadas} atualizadas, ${jaImportadas.length} já importada(s) por outra pessoa.`);
    else toast.success(`Importação concluída: ${criadas} criadas, ${atualizadas} atualizadas.`);
  }

  const totalCriar = linhasValidas.filter((l) => l.acao === "criar").length;
  const totalAtualizar = linhasValidas.filter((l) => l.acao === "atualizar").length;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to="/app">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="size-4 mr-1" />
          Voltar
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Importar reservas (CSV)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie a planilha exportada do Ayrton em formato .csv. Cada linha vira uma tarefa de limpeza checkout — se
            o número da reserva já existir, a tarefa correspondente é atualizada em vez de duplicada. Colunas
            esperadas: código da unidade, data de check-out, número da reserva, hóspedes e noites (nomes de coluna
            flexíveis, ex: "codigo" ou "unidade_codigo").
          </p>
          <div className="flex items-center gap-3">
            <input ref={inputRef} type="file" accept=".csv" onChange={handleArquivo} className="hidden" id="csv-input" />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={processando}>
              <Upload className="size-4 mr-1.5" />
              {processando ? "Processando..." : "Escolher arquivo .csv"}
            </Button>
            {nomeArquivo && <span className="text-sm text-muted-foreground">{nomeArquivo}</span>}
          </div>
        </CardContent>
      </Card>

      {!processando && (linhasValidas.length > 0 || linhasErro.length > 0) && !resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pré-visualização — {totalLinhas} linha(s) lida(s)
            </CardTitle>
            <div className="flex gap-2 flex-wrap pt-1">
              <Badge variant="default">{totalCriar} serão criadas</Badge>
              <Badge variant="secondary">{totalAtualizar} serão atualizadas</Badge>
              {linhasErro.length > 0 && <Badge variant="destructive">{linhasErro.length} com erro</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {linhasValidas.length > 0 && (
              <div className="max-h-72 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Reserva</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Hóspedes</TableHead>
                      <TableHead>Noites</TableHead>
                      <TableHead>Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasValidas.map((l) => (
                      <TableRow key={l.linha}>
                        <TableCell>{l.linha}</TableCell>
                        <TableCell>
                          {l.unidadeNome} · {l.unidadeCodigo}
                        </TableCell>
                        <TableCell>{l.reservaNumero}</TableCell>
                        <TableCell>{l.dataPrevista}</TableCell>
                        <TableCell>{l.hospedes ?? "—"}</TableCell>
                        <TableCell>{l.noites ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={l.acao === "criar" ? "default" : "secondary"}>
                            {l.acao === "criar" ? "Criar" : "Atualizar"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {linhasErro.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="size-4" />
                  Linhas com erro (não serão importadas)
                </p>
                <div className="max-h-48 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Linha</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhasErro.map((e) => (
                        <TableRow key={e.linha}>
                          <TableCell>{e.linha}</TableCell>
                          <TableCell className="whitespace-normal text-sm">{e.motivos.join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={limparPreview} disabled={importando}>
                Cancelar
              </Button>
              <Button onClick={() => setConfirmandoAberto(true)} disabled={linhasValidas.length === 0 || importando}>
                Confirmar importação
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importação concluída</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default">{resultado.criadas} criadas</Badge>
              <Badge variant="secondary">{resultado.atualizadas} atualizadas</Badge>
              {resultado.jaImportadas.length > 0 && (
                <Badge variant="outline">{resultado.jaImportadas.length} já importada(s) por outra pessoa</Badge>
              )}
              {resultado.falhas.length > 0 && <Badge variant="destructive">{resultado.falhas.length} falha(s)</Badge>}
            </div>
            {resultado.jaImportadas.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Essas reservas já tinham sido importadas por outra pessoa entre a pré-visualização e a confirmação —
                  nenhuma tarefa duplicada foi criada:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  {resultado.jaImportadas.map((j, i) => (
                    <li key={i}>{j}</li>
                  ))}
                </ul>
              </div>
            )}
            {resultado.falhas.length > 0 && (
              <ul className="text-sm text-destructive space-y-1 list-disc pl-4">
                {resultado.falhas.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={limparPreview}>
                Nova importação
              </Button>
              <Link to="/app/kanban">
                <Button>Ir para o Kanban</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmandoAberto} onOpenChange={setConfirmandoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar importação</DialogTitle>
            <DialogDescription>
              {totalCriar} tarefa(s) nova(s) e {totalAtualizar} tarefa(s) existente(s) serão atualizadas. Essa ação
              não pode ser desfeita automaticamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoAberto(false)} disabled={importando}>
              Cancelar
            </Button>
            <Button onClick={confirmarImportacao} disabled={importando}>
              {importando ? "Importando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
