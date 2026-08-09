import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, OPERATOR_ROLES } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";
import { TIPO_IMOVEL_LABEL } from "@/lib/domain";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/unidades/nova")({
  component: NovaUnidade,
});

type TipoImovel = Database["public"]["Enums"]["tipo_imovel"];

function NovaUnidade() {
  const nav = useNavigate();
  const { hasAnyRole } = useAuth();
  const podeCriar = hasAnyRole(OPERATOR_ROLES);

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [regiao, setRegiao] = useState("");
  const [tipo, setTipo] = useState<TipoImovel>("apartamento");
  const [quartos, setQuartos] = useState(1);
  const [banheiros, setBanheiros] = useState(1);
  const [capacidade, setCapacidade] = useState(2);
  const [tempoLimpezaMin, setTempoLimpezaMin] = useState(90);
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!podeCriar) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-3">
        <p className="text-sm text-muted-foreground">Você não tem permissão para cadastrar unidades.</p>
        <Link to="/app/unidades">
          <Button variant="outline" size="sm">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  async function salvar() {
    if (!codigo.trim() || !nome.trim() || !endereco.trim() || !regiao.trim()) {
      toast.error("Preencha código, nome, endereço e região.");
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase
      .from("unidades")
      .insert({
        codigo: codigo.trim(),
        nome: nome.trim(),
        endereco: endereco.trim(),
        regiao: regiao.trim(),
        tipo,
        quartos,
        banheiros,
        capacidade,
        tempo_limpeza_min: tempoLimpezaMin,
        observacoes: observacoes.trim() || null,
      })
      .select("id")
      .single();
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Unidade cadastrada");
    nav({ to: "/app/unidades/$id", params: { id: data.id } });
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Link to="/app/unidades">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="size-4 mr-1" />
          Voltar
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nova unidade</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código</Label>
                <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoImovel)}>
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
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="regiao">Região</Label>
              <Input id="regiao" value={regiao} onChange={(e) => setRegiao(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quartos">Quartos</Label>
                <Input id="quartos" type="number" min={0} value={quartos} onChange={(e) => setQuartos(Number(e.target.value))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="banheiros">Banheiros</Label>
                <Input id="banheiros" type="number" min={0} value={banheiros} onChange={(e) => setBanheiros(Number(e.target.value))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="capacidade">Capacidade</Label>
                <Input id="capacidade" type="number" min={1} value={capacidade} onChange={(e) => setCapacidade(Number(e.target.value))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tempo">Limpeza (min)</Label>
                <Input id="tempo" type="number" min={1} value={tempoLimpezaMin} onChange={(e) => setTempoLimpezaMin(Number(e.target.value))} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
            </div>

            <Button type="submit" disabled={salvando} className="w-full">
              {salvando ? "Salvando..." : "Cadastrar unidade"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
