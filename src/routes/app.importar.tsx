import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Upload, AlertTriangle, Home } from "lucide-react";
import { TIPO_IMOVEL_LABEL } from "@/lib/domain";
import { maiorCodigoNumerico } from "@/lib/proximo-codigo-unidade";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/importar")({
  component: ImportarReservas,
});

const TAMANHO_LOTE = 50;

type TipoImovel = Database["public"]["Enums"]["tipo_imovel"];

// Nomes reais das colunas do export do Ayrton (ver ayrton-exemplo-real.csv),
// já passados por normalizarChave. Continua um mapa (em vez de indexar
// direto) pra deixar margem a variações menores sem reescrever o parser.
const CAMPO_ALIASES: Record<string, string[]> = {
  reserva_numero: ["numero"],
  checkout: ["check_out"],
  estado: ["estado"],
  noites: ["noites"],
  acomodacao: ["acomodacao"],
  grupo: ["grupo"],
  n_adultos: ["n__adultos"],
  n_criancas: ["n__criancas"],
  n_bebes: ["n__bebes"],
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

// O export do Ayrton abre com uma linha `sep=,` (marcador de separador do
// Excel, não dado) antes do cabeçalho de verdade. Descarta antes do parse
// pra não virar um cabeçalho errado com uma coluna só.
function descartarLinhaSep(texto: string): { texto: string; removida: boolean } {
  const nlIndex = texto.indexOf("\n");
  const primeiraLinha = (nlIndex === -1 ? texto : texto.slice(0, nlIndex)).trim();
  if (primeiraLinha.replace(/\s/g, "") === "sep=,") {
    return { texto: nlIndex === -1 ? "" : texto.slice(nlIndex + 1), removida: true };
  }
  return { texto, removida: false };
}

// O texto de Acomodacao serve de sugestão de nome pro mini-formulário de
// unidade não registrada — mas costuma vir com marcador solto no final
// (#, +, *, !) que não faz parte do nome de verdade (ex: "Mercure 1212 #",
// "Athos 810+"). Continua editável, só nasce mais limpo.
function limparNomeAcomodacao(acomodacao: string): string {
  return acomodacao.replace(/[\s#+*!]+$/g, "");
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

type LinhaTarefa = {
  linha: number;
  reservaNumero: string;
  dataPrevista: string;
  hospedes: number | null;
  noites: number | null;
  acao: "criar" | "atualizar";
  tarefaExistenteId?: string;
};

type LinhaValida = LinhaTarefa & {
  acomodacao: string;
  unidadeId: string;
  unidadeNome: string;
};

type LinhaErro = {
  linha: number;
  motivos: string[];
};

type UnidadeNaoRegistrada = {
  acomodacao: string;
  linhas: LinhaTarefa[];
  codigo: string;
  nome: string;
  regiao: string;
  tipo: TipoImovel;
  capacidade: number;
};

type Resultado = {
  criadas: number;
  atualizadas: number;
  jaImportadas: string[];
  falhas: string[];
  puladasCanceladas: number;
  unidadesCriadas: string[];
  unidadesPuladas: { acomodacao: string; qtdReservas: number }[];
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
  const [unidadesNaoRegistradas, setUnidadesNaoRegistradas] = useState<UnidadeNaoRegistrada[]>([]);
  const [puladasCanceladas, setPuladasCanceladas] = useState(0);
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
    setUnidadesNaoRegistradas([]);
    setPuladasCanceladas(0);
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
      const textoBruto = await file.text();
      const { texto, removida } = descartarLinhaSep(textoBruto);
      // +1 pelo cabeçalho, +1 se a linha `sep=,` foi descartada, +1 pela
      // indexação em 1 — mantém "linha" batendo com o número real no Excel.
      const offsetLinha = removida ? 3 : 2;

      const Papa = (await import("papaparse")).default;
      const resultadoParse = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
        Papa.parse<Record<string, string>>(texto, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizarChave,
          complete: resolve,
          error: reject,
        });
      });

      const linhasBrutas = resultadoParse.data;
      setTotalLinhas(linhasBrutas.length);

      const { data: unidades, error: unidadesErro } = await supabase.from("unidades").select("id,codigo,nome,nome_ayrton");
      if (unidadesErro) throw unidadesErro;
      const unidadePorAcomodacao = new Map(
        (unidades ?? []).filter((u) => u.nome_ayrton).map((u) => [u.nome_ayrton!.trim(), u])
      );
      let proximoCodigo = maiorCodigoNumerico(unidades ?? []) + 1;

      const erros: LinhaErro[] = [];
      const reservasVistas = new Map<string, number>();
      const comUnidade: LinhaValida[] = [];
      const gruposPendentes = new Map<string, { grupo: string; linhas: LinhaTarefa[] }>();
      let puladas = 0;

      linhasBrutas.forEach((row, i) => {
        const linha = i + offsetLinha;

        const estado = valorDoCampo(row, "estado").toLowerCase();
        if (estado === "cancelada") {
          puladas++;
          return;
        }

        const motivos: string[] = [];

        const reservaNumero = valorDoCampo(row, "reserva_numero");
        if (!reservaNumero) motivos.push("Número da reserva ausente");
        else if (reservasVistas.has(reservaNumero)) {
          motivos.push(`Reserva duplicada nesta planilha (já aparece na linha ${reservasVistas.get(reservaNumero)})`);
        }

        const checkoutRaw = valorDoCampo(row, "checkout");
        const dataPrevista = checkoutRaw ? parseDataCheckout(checkoutRaw) : null;
        if (!checkoutRaw) motivos.push("Data de check-out ausente");
        else if (!dataPrevista) motivos.push(`Data de check-out inválida: "${checkoutRaw}"`);

        const acomodacao = valorDoCampo(row, "acomodacao");
        if (!acomodacao) motivos.push("Acomodação ausente");

        const adultosRaw = valorDoCampo(row, "n_adultos");
        const criancasRaw = valorDoCampo(row, "n_criancas");
        const bebesRaw = valorDoCampo(row, "n_bebes");
        const { valor: adultos, ok: adultosOk } = parseInteiroOpcional(adultosRaw);
        const { valor: criancas, ok: criancasOk } = parseInteiroOpcional(criancasRaw);
        const { valor: bebes, ok: bebesOk } = parseInteiroOpcional(bebesRaw);
        if (!adultosOk || !criancasOk || !bebesOk) motivos.push("Número de hóspedes inválido");
        const algumHospedeInformado = !!(adultosRaw || criancasRaw || bebesRaw);
        const hospedes =
          adultosOk && criancasOk && bebesOk && algumHospedeInformado ? (adultos ?? 0) + (criancas ?? 0) + (bebes ?? 0) : null;

        const { valor: noites, ok: noitesOk } = parseInteiroOpcional(valorDoCampo(row, "noites"));
        if (!noitesOk) motivos.push("Número de noites inválido");

        if (motivos.length > 0) {
          erros.push({ linha, motivos });
          return;
        }

        if (reservaNumero) reservasVistas.set(reservaNumero, linha);

        const base: LinhaTarefa = {
          linha,
          reservaNumero,
          dataPrevista: dataPrevista!,
          hospedes,
          noites,
          acao: "criar",
        };

        const acomodacaoLimpa = acomodacao.trim();
        const unidade = unidadePorAcomodacao.get(acomodacaoLimpa);
        if (unidade) {
          comUnidade.push({ ...base, acomodacao: acomodacaoLimpa, unidadeId: unidade.id, unidadeNome: unidade.nome });
        } else {
          const grupo = valorDoCampo(row, "grupo");
          const grupoExistente = gruposPendentes.get(acomodacaoLimpa);
          if (grupoExistente) grupoExistente.linhas.push(base);
          else gruposPendentes.set(acomodacaoLimpa, { grupo, linhas: [base] });
        }
      });

      // Verifica reservas já existentes em lotes (evita URL enorme num .in() só).
      // Independe de a unidade já estar cadastrada — reserva_numero é único
      // em tarefas de qualquer forma.
      const existentesPorReserva = new Map<string, string>();
      const todosNumeros = [
        ...comUnidade.map((c) => c.reservaNumero),
        ...[...gruposPendentes.values()].flatMap((g) => g.linhas.map((l) => l.reservaNumero)),
      ];
      for (let i = 0; i < todosNumeros.length; i += 200) {
        const lote = todosNumeros.slice(i, i + 200);
        if (lote.length === 0) continue;
        const { data, error } = await supabase.from("tarefas").select("id,reserva_numero").in("reserva_numero", lote);
        if (error) throw error;
        for (const t of data ?? []) {
          if (t.reserva_numero) existentesPorReserva.set(t.reserva_numero, t.id);
        }
      }

      function comAcao<T extends LinhaTarefa>(l: T): T {
        const existenteId = existentesPorReserva.get(l.reservaNumero);
        return existenteId ? { ...l, acao: "atualizar", tarefaExistenteId: existenteId } : { ...l, acao: "criar" };
      }

      const validas = comUnidade.map(comAcao);
      const naoRegistradas: UnidadeNaoRegistrada[] = [...gruposPendentes.entries()].map(([acomodacao, g]) => ({
        acomodacao,
        linhas: g.linhas.map(comAcao),
        codigo: String(proximoCodigo++),
        nome: limparNomeAcomodacao(acomodacao),
        regiao: g.grupo.trim(),
        tipo: "apartamento",
        capacidade: 2,
      }));

      setLinhasValidas(validas);
      setLinhasErro(erros);
      setUnidadesNaoRegistradas(naoRegistradas);
      setPuladasCanceladas(puladas);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar o arquivo.");
    } finally {
      setProcessando(false);
    }
  }

  function atualizarUnidadeNaoRegistrada(acomodacao: string, patch: Partial<UnidadeNaoRegistrada>) {
    setUnidadesNaoRegistradas((prev) => prev.map((u) => (u.acomodacao === acomodacao ? { ...u, ...patch } : u)));
  }

  async function confirmarImportacao() {
    setImportando(true);
    const falhas: string[] = [];
    const jaImportadas: string[] = [];
    const unidadesCriadas: string[] = [];
    const unidadesPuladas: { acomodacao: string; qtdReservas: number }[] = [];
    let criadas = 0;
    let atualizadas = 0;

    // 1. Cria as unidades preenchidas nos mini-formulários antes de mexer em
    // tarefas — as reservas dessas unidades dependem do id gerado aqui.
    const idPorAcomodacao = new Map<string, string>();
    for (const u of unidadesNaoRegistradas) {
      if (!u.codigo.trim() || !u.nome.trim() || !u.regiao.trim()) {
        unidadesPuladas.push({ acomodacao: u.acomodacao, qtdReservas: u.linhas.length });
        continue;
      }
      const { data, error } = await supabase
        .from("unidades")
        .insert({
          codigo: u.codigo.trim(),
          nome: u.nome.trim(),
          endereco: "",
          regiao: u.regiao.trim(),
          tipo: u.tipo,
          capacidade: u.capacidade,
          nome_ayrton: u.acomodacao,
        })
        .select("id")
        .single();
      if (error || !data) {
        falhas.push(`Unidade "${u.nome.trim()}" (${u.acomodacao}): ${error?.message ?? "falha ao criar"}`);
        unidadesPuladas.push({ acomodacao: u.acomodacao, qtdReservas: u.linhas.length });
        continue;
      }
      idPorAcomodacao.set(u.acomodacao, data.id);
      unidadesCriadas.push(`${u.nome.trim()} (${u.codigo.trim()})`);
    }

    const linhasDasNovas: LinhaValida[] = unidadesNaoRegistradas.flatMap((u) => {
      const unidadeId = idPorAcomodacao.get(u.acomodacao);
      if (!unidadeId) return [];
      return u.linhas.map((l) => ({ ...l, acomodacao: u.acomodacao, unidadeId, unidadeNome: u.nome.trim() }));
    });

    const todasAsLinhas = [...linhasValidas, ...linhasDasNovas];
    const paraCriar = todasAsLinhas.filter((l) => l.acao === "criar");
    const paraAtualizar = todasAsLinhas.filter((l) => l.acao === "atualizar");

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
    setResultado({ criadas, atualizadas, jaImportadas, falhas, puladasCanceladas, unidadesCriadas, unidadesPuladas });
    if (falhas.length > 0) toast.error(`Importação concluída com ${falhas.length} falha(s). Veja o resumo.`);
    else if (jaImportadas.length > 0)
      toast.success(`Importação concluída: ${criadas} criadas, ${atualizadas} atualizadas, ${jaImportadas.length} já importada(s) por outra pessoa.`);
    else toast.success(`Importação concluída: ${criadas} criadas, ${atualizadas} atualizadas.`);
  }

  const totalCriar = linhasValidas.filter((l) => l.acao === "criar").length;
  const totalAtualizar = linhasValidas.filter((l) => l.acao === "atualizar").length;
  const reservasAguardandoUnidade = unidadesNaoRegistradas.reduce((acc, u) => acc + u.linhas.length, 0);
  const unidadesPreenchidas = unidadesNaoRegistradas.filter((u) => u.codigo.trim() && u.nome.trim() && u.regiao.trim());
  const temAlgoParaImportar = linhasValidas.length > 0 || unidadesNaoRegistradas.length > 0;

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
            Envie a planilha exportada do Ayrton em formato .csv. Cada reserva vira uma tarefa de limpeza checkout — se
            o número da reserva (coluna "Numero") já existir, a tarefa correspondente é atualizada em vez de
            duplicada. Reservas com Estado "Cancelada" são ignoradas. A unidade é identificada pela coluna
            "Acomodacao"; se o texto não bater com nenhuma unidade cadastrada, você pode cadastrar na hora, na
            pré-visualização.
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

      {!processando && (linhasValidas.length > 0 || linhasErro.length > 0 || unidadesNaoRegistradas.length > 0) && !resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-visualização — {totalLinhas} linha(s) lida(s)</CardTitle>
            <div className="flex gap-2 flex-wrap pt-1">
              <Badge variant="default">{totalCriar} serão criadas</Badge>
              <Badge variant="secondary">{totalAtualizar} serão atualizadas</Badge>
              {reservasAguardandoUnidade > 0 && (
                <Badge variant="outline">{reservasAguardandoUnidade} aguardando cadastro de unidade</Badge>
              )}
              {puladasCanceladas > 0 && <Badge variant="outline">{puladasCanceladas} pulada(s) (canceladas)</Badge>}
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
                          {l.unidadeNome} <span className="text-muted-foreground">· {l.acomodacao}</span>
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

            {unidadesNaoRegistradas.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Home className="size-4" />
                  Unidades não registradas ({unidadesNaoRegistradas.length})
                </p>
                <p className="text-xs text-muted-foreground">
                  Essas "Acomodacao" da planilha não batem com nenhuma unidade já cadastrada. Preencha pra cadastrar e
                  importar as reservas junto; deixe em branco pra deixar essas reservas de fora dessa importação.
                </p>
                <div className="space-y-3">
                  {unidadesNaoRegistradas.map((u) => (
                    <UnidadeNaoRegistradaForm key={u.acomodacao} unidade={u} onChange={atualizarUnidadeNaoRegistrada} />
                  ))}
                </div>
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
              <Button onClick={() => setConfirmandoAberto(true)} disabled={!temAlgoParaImportar || importando}>
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
              {resultado.unidadesCriadas.length > 0 && (
                <Badge variant="outline">{resultado.unidadesCriadas.length} unidade(s) cadastrada(s)</Badge>
              )}
              {resultado.puladasCanceladas > 0 && <Badge variant="outline">{resultado.puladasCanceladas} pulada(s) (canceladas)</Badge>}
              {resultado.jaImportadas.length > 0 && (
                <Badge variant="outline">{resultado.jaImportadas.length} já importada(s) por outra pessoa</Badge>
              )}
              {resultado.unidadesPuladas.length > 0 && (
                <Badge variant="destructive">{resultado.unidadesPuladas.length} unidade(s) não cadastrada(s)</Badge>
              )}
              {resultado.falhas.length > 0 && <Badge variant="destructive">{resultado.falhas.length} falha(s)</Badge>}
            </div>
            {resultado.unidadesCriadas.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Unidades cadastradas nessa importação:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  {resultado.unidadesCriadas.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {resultado.unidadesPuladas.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-destructive">
                  Essas unidades ficaram sem cadastro (formulário em branco ou erro ao criar) — as reservas delas não
                  foram importadas. Cadastre a unidade e reimporte o arquivo pra trazer essas reservas:
                </p>
                <ul className="text-sm text-destructive space-y-1 list-disc pl-4">
                  {resultado.unidadesPuladas.map((u, i) => (
                    <li key={i}>
                      {u.acomodacao} — {u.qtdReservas} reserva(s)
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
              {totalCriar} tarefa(s) nova(s) e {totalAtualizar} tarefa(s) existente(s) serão atualizadas.
              {unidadesPreenchidas.length > 0 &&
                ` ${unidadesPreenchidas.length} unidade(s) nova(s) serão cadastradas, trazendo mais ${unidadesPreenchidas.reduce((acc, u) => acc + u.linhas.length, 0)} reserva(s) junto.`}
              {unidadesNaoRegistradas.length > unidadesPreenchidas.length &&
                ` ${unidadesNaoRegistradas.length - unidadesPreenchidas.length} unidade(s) sem formulário preenchido ficarão de fora.`}
              {" "}Essa ação não pode ser desfeita automaticamente.
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

function UnidadeNaoRegistradaForm({
  unidade,
  onChange,
}: {
  unidade: UnidadeNaoRegistrada;
  onChange: (acomodacao: string, patch: Partial<UnidadeNaoRegistrada>) => void;
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">{unidade.acomodacao}</div>
        <Badge variant="outline" className="shrink-0">
          {unidade.linhas.length} reserva{unidade.linhas.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        Código interno: <span className="font-mono">{unidade.codigo}</span> (gerado automaticamente)
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`nome-${unidade.acomodacao}`}>Nome</Label>
        <Input
          id={`nome-${unidade.acomodacao}`}
          value={unidade.nome}
          onChange={(e) => onChange(unidade.acomodacao, { nome: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`regiao-${unidade.acomodacao}`}>Região</Label>
          <Input
            id={`regiao-${unidade.acomodacao}`}
            value={unidade.regiao}
            onChange={(e) => onChange(unidade.acomodacao, { regiao: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tipo-${unidade.acomodacao}`}>Tipo</Label>
          <Select value={unidade.tipo} onValueChange={(v) => onChange(unidade.acomodacao, { tipo: v as TipoImovel })}>
            <SelectTrigger id={`tipo-${unidade.acomodacao}`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_IMOVEL_LABEL).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`capacidade-${unidade.acomodacao}`}>Capacidade</Label>
          <Input
            id={`capacidade-${unidade.acomodacao}`}
            type="number"
            min={1}
            value={unidade.capacidade}
            onChange={(e) => onChange(unidade.acomodacao, { capacidade: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
