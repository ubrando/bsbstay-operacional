import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth, OPERATOR_ROLES } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building2 } from "lucide-react";
import { UNIDADE_STATUS_LABEL, TIPO_IMOVEL_LABEL, statusBadgeVariant } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import type { Database } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/unidades/")({
  component: UnidadesLista,
});

type UnidadeRow = Pick<Database["public"]["Tables"]["unidades"]["Row"], "id" | "codigo" | "nome" | "regiao" | "tipo" | "status" | "ativo">;

const TODAS_REGIOES = "__todas__";
const TODOS_STATUS = "__todos__";

function UnidadesLista() {
  const { hasAnyRole } = useAuth();
  const podeCriar = hasAnyRole(OPERATOR_ROLES);

  const [unidades, setUnidades] = useState<UnidadeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [regiao, setRegiao] = useState(TODAS_REGIOES);
  const [status, setStatus] = useState(TODOS_STATUS);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("unidades").select("id,codigo,nome,regiao,tipo,status,ativo").order("nome", { ascending: true });
    if (error) console.error(error);
    setUnidades(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(["unidades"], load);

  const regioes = useMemo(() => [...new Set(unidades.map((u) => u.regiao))].sort(), [unidades]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return unidades.filter((u) => {
      if (q && !u.nome.toLowerCase().includes(q) && !u.codigo.toLowerCase().includes(q)) return false;
      if (regiao !== TODAS_REGIOES && u.regiao !== regiao) return false;
      if (status !== TODOS_STATUS && u.status !== status) return false;
      return true;
    });
  }, [unidades, busca, regiao, status]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Unidades</h1>
          <p className="text-muted-foreground text-sm">{unidades.length} cadastradas</p>
        </div>
        {podeCriar && (
          <Link to="/app/unidades/nova">
            <Button size="sm">
              <Plus className="size-4" />
              Nova unidade
            </Button>
          </Link>
        )}
      </header>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por código ou nome..." value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 pl-8" />
        </div>
        <Select value={regiao} onValueChange={setRegiao}>
          <SelectTrigger className="h-9 sm:w-44">
            <SelectValue placeholder="Região" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS_REGIOES}>Todas as regiões</SelectItem>
            {regioes.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_STATUS}>Todos os status</SelectItem>
            {Object.entries(UNIDADE_STATUS_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Carregando...</p>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            {unidades.length === 0 ? "Nenhuma unidade cadastrada ainda." : "Nenhuma unidade encontrada para o filtro atual."}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {filtradas.map((u) => (
              <Link
                key={u.id}
                to="/app/unidades/$id"
                params={{ id: u.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent transition-colors"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="size-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Building2 className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {u.nome} <span className="text-muted-foreground font-normal">· {u.codigo}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {TIPO_IMOVEL_LABEL[u.tipo] ?? u.tipo} · {u.regiao}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!u.ativo && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inativa
                    </Badge>
                  )}
                  <Badge variant={statusBadgeVariant(u.status)}>{UNIDADE_STATUS_LABEL[u.status] ?? u.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
