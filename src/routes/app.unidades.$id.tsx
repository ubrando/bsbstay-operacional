import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, OPERATOR_ROLES, FRONT_DESK_ROLES } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Trash2, Plus, BedDouble } from "lucide-react";
import { UNIDADE_STATUS_LABEL, TIPO_IMOVEL_LABEL, TIPO_CAMA_LABEL, statusBadgeVariant } from "@/lib/domain";
import { toast } from "sonner";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/unidades/$id")({
  component: UnidadeDetalhe,
});

type Unidade = Database["public"]["Tables"]["unidades"]["Row"];
type Quarto = Database["public"]["Tables"]["quartos_config"]["Row"];
type UnidadeStatus = Database["public"]["Enums"]["unidade_status"];
type TipoImovel = Database["public"]["Enums"]["tipo_imovel"];

type EditForm = {
  nome: string;
  endereco: string;
  regiao: string;
  tipo: TipoImovel;
  quartos: number;
  banheiros: number;
  capacidade: number;
  tempo_limpeza_min: number;
  observacoes: string;
  ativo: boolean;
};

function formFromUnidade(u: Unidade): EditForm {
  return {
    nome: u.nome,
    endereco: u.endereco,
    regiao: u.regiao,
    tipo: u.tipo,
    quartos: u.quartos,
    banheiros: u.banheiros,
    capacidade: u.capacidade,
    tempo_limpeza_min: u.tempo_limpeza_min,
    observacoes: u.observacoes ?? "",
    ativo: u.ativo,
  };
}

function UnidadeDetalhe() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { hasAnyRole } = useAuth();
  const podeGerenciar = hasAnyRole(OPERATOR_ROLES);
  const podeAtualizarStatus = podeGerenciar || hasAnyRole(FRONT_DESK_ROLES) || hasAnyRole(["vistoriador"]);

  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [quartos, setQuartos] = useState<Quarto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

  const load = useCallback(async () => {
    const [{ data: u, error }, { data: qs }] = await Promise.all([
      supabase.from("unidades").select("*").eq("id", id).maybeSingle(),
      supabase.from("quartos_config").select("*").eq("unidade_id", id).order("created_at", { ascending: true }),
    ]);
    if (error) console.error(error);
    setUnidade(u);
    setForm((prev) => prev ?? (u ? formFromUnidade(u) : null));
    setQuartos(qs ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(["unidades", "quartos_config"], load);

  async function mudarStatus(status: UnidadeStatus) {
    if (!unidade) return;
    setBusy(true);
    const { error } = await supabase.from("unidades").update({ status }).eq("id", unidade.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
  }

  async function salvarEdicao() {
    if (!unidade || !form) return;
    if (!form.nome.trim() || !form.endereco.trim() || !form.regiao.trim()) {
      toast.error("Preencha nome, endereço e região.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("unidades")
      .update({
        nome: form.nome.trim(),
        endereco: form.endereco.trim(),
        regiao: form.regiao.trim(),
        tipo: form.tipo,
        quartos: form.quartos,
        banheiros: form.banheiros,
        capacidade: form.capacidade,
        tempo_limpeza_min: form.tempo_limpeza_min,
        observacoes: form.observacoes.trim() || null,
        ativo: form.ativo,
      })
      .eq("id", unidade.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Unidade atualizada");
  }

  async function excluirUnidade() {
    if (!unidade) return;
    if (!window.confirm(`Excluir a unidade "${unidade.nome}"? Essa ação não pode ser desfeita.`)) return;
    setBusy(true);
    const { error } = await supabase.from("unidades").delete().eq("id", unidade.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Unidade excluída");
    nav({ to: "/app/unidades" });
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;
  if (!unidade || !form) return <div className="text-center py-8 text-muted-foreground text-sm">Unidade não encontrada.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/app/unidades">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="size-4 mr-1" />
            Voltar
          </Button>
        </Link>
        {podeAtualizarStatus ? (
          <Select value={unidade.status} onValueChange={(v) => mudarStatus(v as UnidadeStatus)} disabled={busy}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(UNIDADE_STATUS_LABEL).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={statusBadgeVariant(unidade.status)}>{UNIDADE_STATUS_LABEL[unidade.status]}</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {unidade.nome} <span className="text-muted-foreground font-normal">· {unidade.codigo}</span>
            </span>
            {!unidade.ativo && <Badge variant="outline">Inativa</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {podeGerenciar ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                salvarEdicao();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tipo">Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoImovel })}>
                    <SelectTrigger id="tipo" className="h-9">
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
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="endereco">Endereço</Label>
                <Input id="endereco" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="regiao">Região</Label>
                <Input id="regiao" value={form.regiao} onChange={(e) => setForm({ ...form, regiao: e.target.value })} required />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quartos">Quartos</Label>
                  <Input
                    id="quartos"
                    type="number"
                    min={0}
                    value={form.quartos}
                    onChange={(e) => setForm({ ...form, quartos: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="banheiros">Banheiros</Label>
                  <Input
                    id="banheiros"
                    type="number"
                    min={0}
                    value={form.banheiros}
                    onChange={(e) => setForm({ ...form, banheiros: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="capacidade">Capacidade</Label>
                  <Input
                    id="capacidade"
                    type="number"
                    min={1}
                    value={form.capacidade}
                    onChange={(e) => setForm({ ...form, capacidade: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tempo">Limpeza (min)</Label>
                  <Input
                    id="tempo"
                    type="number"
                    min={1}
                    value={form.tempo_limpeza_min}
                    onChange={(e) => setForm({ ...form, tempo_limpeza_min: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea id="observacoes" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
              </div>

              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="ativo" className="cursor-pointer">
                  Unidade ativa
                </Label>
                <Switch id="ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="destructive" size="sm" onClick={excluirUnidade} disabled={busy}>
                  <Trash2 className="size-4 mr-1" />
                  Excluir
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Endereço</div>
                <div>{unidade.endereco}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Região</div>
                <div>{unidade.regiao}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Tipo</div>
                <div>{TIPO_IMOVEL_LABEL[unidade.tipo] ?? unidade.tipo}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Capacidade</div>
                <div>{unidade.capacidade} hóspedes</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Quartos / Banheiros</div>
                <div>
                  {unidade.quartos} / {unidade.banheiros}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Tempo de limpeza</div>
                <div>{unidade.tempo_limpeza_min} min</div>
              </div>
              {unidade.observacoes && (
                <div className="col-span-2">
                  <div className="text-muted-foreground text-xs">Observações</div>
                  <div className="whitespace-pre-wrap">{unidade.observacoes}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <QuartosConfig unidadeId={unidade.id} quartos={quartos} podeGerenciar={podeGerenciar} />
    </div>
  );
}

type NovoQuarto = {
  nome: string;
  tipo_cama: Database["public"]["Enums"]["tipo_cama"];
  quantidade: number;
  cama_extra: boolean;
  observacoes: string;
};

const NOVO_QUARTO_INICIAL: NovoQuarto = { nome: "", tipo_cama: "casal", quantidade: 1, cama_extra: false, observacoes: "" };

function QuartosConfig({ unidadeId, quartos, podeGerenciar }: { unidadeId: string; quartos: Quarto[]; podeGerenciar: boolean }) {
  const [novo, setNovo] = useState<NovoQuarto>(NOVO_QUARTO_INICIAL);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function adicionar() {
    if (!novo.nome.trim()) {
      toast.error("Informe o nome do quarto.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("quartos_config").insert({
      unidade_id: unidadeId,
      nome: novo.nome.trim(),
      tipo_cama: novo.tipo_cama,
      quantidade: novo.quantidade,
      cama_extra: novo.cama_extra,
      observacoes: novo.observacoes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Quarto adicionado");
    setNovo(NOVO_QUARTO_INICIAL);
    setMostrarForm(false);
  }

  async function remover(quarto: Quarto) {
    if (!window.confirm(`Remover o quarto "${quarto.nome}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from("quartos_config").delete().eq("id", quarto.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Quarto removido");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <BedDouble className="size-4" />
          Quartos
        </CardTitle>
        {podeGerenciar && !mostrarForm && (
          <Button size="sm" variant="outline" onClick={() => setMostrarForm(true)}>
            <Plus className="size-4 mr-1" />
            Adicionar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {quartos.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum quarto cadastrado.</div>
        ) : (
          <ul className="space-y-2">
            {quartos.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{q.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {TIPO_CAMA_LABEL[q.tipo_cama] ?? q.tipo_cama} × {q.quantidade}
                    {q.cama_extra && " · cama extra"}
                    {q.observacoes && ` · ${q.observacoes}`}
                  </div>
                </div>
                {podeGerenciar && (
                  <Button variant="ghost" size="icon" onClick={() => remover(q)} disabled={busy} aria-label="Remover quarto">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeGerenciar && mostrarForm && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quarto-nome">Nome</Label>
                <Input id="quarto-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Quarto 1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quarto-tipo-cama">Tipo de cama</Label>
                <Select value={novo.tipo_cama} onValueChange={(v) => setNovo({ ...novo, tipo_cama: v as NovoQuarto["tipo_cama"] })}>
                  <SelectTrigger id="quarto-tipo-cama" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_CAMA_LABEL).map(([v, label]) => (
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
                <Label htmlFor="quarto-quantidade">Quantidade</Label>
                <Input
                  id="quarto-quantidade"
                  type="number"
                  min={1}
                  value={novo.quantidade}
                  onChange={(e) => setNovo({ ...novo, quantidade: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 mt-6">
                <Label htmlFor="quarto-extra" className="cursor-pointer text-sm">
                  Cama extra
                </Label>
                <Switch id="quarto-extra" checked={novo.cama_extra} onCheckedChange={(v) => setNovo({ ...novo, cama_extra: v })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quarto-obs">Observações</Label>
              <Input id="quarto-obs" value={novo.observacoes} onChange={(e) => setNovo({ ...novo, observacoes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMostrarForm(false);
                  setNovo(NOVO_QUARTO_INICIAL);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={adicionar} disabled={busy}>
                Adicionar quarto
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
