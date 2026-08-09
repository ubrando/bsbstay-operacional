import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, FRONT_DESK_ROLES } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ClipboardCheck, Plus, Square, Pencil, Trash2, Check, X } from "lucide-react";
import { TAREFA_TIPO_LABEL, PRIORIDADE_LABEL, TAREFA_STATUS_LABEL } from "@/lib/domain";
import { useResponsaveisDisponiveis } from "@/lib/use-responsaveis-disponiveis";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/tarefas/nova")({
  component: NovaTarefa,
});

type TarefaTipo = Database["public"]["Enums"]["tarefa_tipo"];
type TarefaPrioridade = Database["public"]["Enums"]["tarefa_prioridade"];
type TarefaStatus = Database["public"]["Enums"]["tarefa_status"];
type UnidadeOpcao = { id: string; codigo: string; nome: string };
type DemandaLocal = { id: string; texto: string };

const todayStr = () => new Date().toISOString().slice(0, 10);
const STATUS_INICIAL_OPCOES: TarefaStatus[] = ["pendente", "em_andamento", "pausada"];

function NovaTarefa() {
  const nav = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const podeCriar = hasAnyRole(FRONT_DESK_ROLES);

  const [unidades, setUnidades] = useState<UnidadeOpcao[]>([]);
  const [unidadeId, setUnidadeId] = useState("");
  const [tipo, setTipo] = useState<TarefaTipo>("limpeza_checkout");
  const [prioridade, setPrioridade] = useState<TarefaPrioridade>("media");
  const [statusInicial, setStatusInicial] = useState<TarefaStatus>("pendente");
  const [dataPrevista, setDataPrevista] = useState(todayStr());
  const [horaPrevista, setHoraPrevista] = useState("");
  const [hospedes, setHospedes] = useState("");
  const [noites, setNoites] = useState("");
  const [camareiraId, setCamareiraId] = useState("");
  const [vistoriadorId, setVistoriadorId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [demandas, setDemandas] = useState<DemandaLocal[]>([]);
  const [novaDemanda, setNovaDemanda] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");

  const { camareiras, vistoriadores, ehLimpeza, ehVistoria } = useResponsaveisDisponiveis(tipo, podeCriar);

  function adicionarDemanda() {
    if (!novaDemanda.trim()) return;
    setDemandas((prev) => [...prev, { id: crypto.randomUUID(), texto: novaDemanda.trim() }]);
    setNovaDemanda("");
  }

  function removerDemanda(id: string) {
    setDemandas((prev) => prev.filter((d) => d.id !== id));
    if (editandoId === id) {
      setEditandoId(null);
      setEditTexto("");
    }
  }

  function iniciarEdicaoDemanda(d: DemandaLocal) {
    setEditandoId(d.id);
    setEditTexto(d.texto);
  }

  function cancelarEdicaoDemanda() {
    setEditandoId(null);
    setEditTexto("");
  }

  function salvarEdicaoDemanda() {
    if (!editandoId || !editTexto.trim()) return;
    setDemandas((prev) => prev.map((d) => (d.id === editandoId ? { ...d, texto: editTexto.trim() } : d)));
    setEditandoId(null);
    setEditTexto("");
  }

  useEffect(() => {
    if (!podeCriar) return;
    supabase
      .from("unidades")
      .select("id,codigo,nome")
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setUnidades(data ?? []);
      });
  }, [podeCriar]);

  useEffect(() => {
    const aindaLimpeza = tipo === "limpeza_checkout" || tipo === "limpeza_intermediaria";
    const aindaVistoria = tipo === "vistoria";
    if (!aindaLimpeza) setCamareiraId("");
    if (!aindaLimpeza && !aindaVistoria) {
      setVistoriadorId("");
      setDemandas([]);
      setNovaDemanda("");
      setEditandoId(null);
      setEditTexto("");
    }
  }, [tipo]);

  if (!podeCriar) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-3">
        <p className="text-sm text-muted-foreground">Você não tem permissão para criar tarefas.</p>
        <Link to="/app/kanban">
          <Button variant="outline" size="sm">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  async function salvar() {
    if (!unidadeId) {
      toast.error("Selecione uma unidade.");
      return;
    }
    setSalvando(true);

    const responsavelId = ehVistoria ? vistoriadorId || null : ehLimpeza ? camareiraId || null : null;
    const insert: Database["public"]["Tables"]["tarefas"]["Insert"] = {
      unidade_id: unidadeId,
      tipo,
      prioridade,
      status: statusInicial,
      data_prevista: dataPrevista,
      hora_prevista: horaPrevista || null,
      hospedes: ehLimpeza && hospedes ? Number(hospedes) : null,
      noites: ehLimpeza && noites ? Number(noites) : null,
      observacoes: observacoes.trim() || null,
      criado_por: user?.id,
      responsavel_id: responsavelId,
      vistoriador_id: ehLimpeza || ehVistoria ? vistoriadorId || null : null,
    };
    if (statusInicial === "em_andamento") insert.iniciado_em = new Date().toISOString();

    const { data, error } = await supabase.from("tarefas").insert(insert).select("id").single();
    if (error) {
      setSalvando(false);
      return toast.error(error.message);
    }
    if (ehLimpeza && camareiraId) {
      const { error: camErr } = await supabase.from("tarefa_camareiras").insert({ tarefa_id: data.id, user_id: camareiraId });
      if (camErr) toast.error("Tarefa criada, mas não foi possível vincular a camareira: " + camErr.message);
    }
    if (demandas.length) {
      const { error: demErr } = await supabase
        .from("vistoria_demandas")
        .insert(demandas.map((d) => ({ tarefa_id: data.id, texto: d.texto, criado_por: user?.id })));
      if (demErr) toast.error("Tarefa criada, mas não foi possível salvar as demandas: " + demErr.message);
    }
    setSalvando(false);
    toast.success("Tarefa criada");
    nav({ to: "/app/kanban", search: { dia: dataPrevista } });
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Link to="/app/kanban">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="size-4 mr-1" />
          Voltar
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nova tarefa</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="unidade">Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger id="unidade" className="h-9">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome} · {u.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TarefaTipo)}>
                  <SelectTrigger id="tipo" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TAREFA_TIPO_LABEL).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prioridade">Prioridade</Label>
                <Select value={prioridade} onValueChange={(v) => setPrioridade(v as TarefaPrioridade)}>
                  <SelectTrigger id="prioridade" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORIDADE_LABEL).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="data">Data prevista</Label>
                <Input id="data" type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value || todayStr())} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hora">Hora prevista</Label>
                <Input id="hora" type="time" value={horaPrevista} onChange={(e) => setHoraPrevista(e.target.value)} />
              </div>
            </div>

            {ehLimpeza && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hospedes">Hóspedes</Label>
                  <Input id="hospedes" type="number" min={0} value={hospedes} onChange={(e) => setHospedes(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="noites">Noites</Label>
                  <Input id="noites" type="number" min={0} value={noites} onChange={(e) => setNoites(e.target.value)} />
                </div>
              </div>
            )}

            {(ehLimpeza || ehVistoria) && (
              <div className="grid grid-cols-2 gap-3">
                {ehLimpeza && (
                  <div className="space-y-1.5">
                    <Label htmlFor="camareira">Camareira responsável</Label>
                    <Select value={camareiraId || "__none__"} onValueChange={(v) => setCamareiraId(v === "__none__" ? "" : v)}>
                      <SelectTrigger id="camareira" className="h-9">
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sem camareira —</SelectItem>
                        {camareiras.map((c) => (
                          <SelectItem key={c.user_id} value={c.user_id}>
                            {c.nome_completo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="vistoriador">{ehVistoria ? "Vistoriador" : "Vistoriador previsto"}</Label>
                  <Select value={vistoriadorId || "__none__"} onValueChange={(v) => setVistoriadorId(v === "__none__" ? "" : v)}>
                    <SelectTrigger id="vistoriador" className="h-9">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sem vistoriador —</SelectItem>
                      {vistoriadores.map((v) => (
                        <SelectItem key={v.user_id} value={v.user_id}>
                          {v.nome_completo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {(ehLimpeza || ehVistoria) && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <ClipboardCheck className="size-3.5" />
                  Demandas para vistoria
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={novaDemanda}
                    onChange={(e) => setNovaDemanda(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        adicionarDemanda();
                      }
                    }}
                    placeholder="Nova demanda..."
                    className="h-9"
                  />
                  <Button type="button" variant="outline" onClick={adicionarDemanda} disabled={!novaDemanda.trim()}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                {demandas.length > 0 && (
                  <ul className="space-y-1.5 pt-1">
                    {demandas.map((d) => (
                      <li key={d.id} className="flex items-center gap-2">
                        <Square className="size-4 text-muted-foreground shrink-0" />
                        {editandoId === d.id ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <Input
                              value={editTexto}
                              onChange={(e) => setEditTexto(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  salvarEdicaoDemanda();
                                }
                                if (e.key === "Escape") cancelarEdicaoDemanda();
                              }}
                              autoFocus
                              className="h-8 text-sm"
                            />
                            <button type="button" onClick={salvarEdicaoDemanda} disabled={!editTexto.trim()} aria-label="Salvar">
                              <Check className="size-4 text-success" />
                            </button>
                            <button type="button" onClick={cancelarEdicaoDemanda} aria-label="Cancelar">
                              <X className="size-4 text-muted-foreground" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm flex-1">{d.texto}</span>
                            <button type="button" onClick={() => iniciarEdicaoDemanda(d)} aria-label="Editar">
                              <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                            <button type="button" onClick={() => removerDemanda(d.id)} aria-label="Excluir">
                              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="status">Status inicial</Label>
              <Select value={statusInicial} onValueChange={(v) => setStatusInicial(v as TarefaStatus)}>
                <SelectTrigger id="status" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_INICIAL_OPCOES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {TAREFA_STATUS_LABEL[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
            </div>

            <Button type="submit" disabled={salvando} className="w-full">
              {salvando ? "Salvando..." : "Criar tarefa"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
