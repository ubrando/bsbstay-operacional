import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import { useAuth, FRONT_DESK_ROLES, isSomenteExecucao } from "@/lib/auth";

export const Route = createFileRoute("/app/")({
  component: Painel,
});

function Painel() {
  const { roles, hasAnyRole } = useAuth();
  const nav = useNavigate();
  const podeCriar = hasAnyRole(FRONT_DESK_ROLES);
  const somenteExecucao = isSomenteExecucao(roles);

  useEffect(() => {
    if (somenteExecucao) nav({ to: "/app/minhas-tarefas" });
  }, [somenteExecucao]);

  if (somenteExecucao) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Painel Operacional</h1>
        {podeCriar && (
          <div className="flex gap-2">
            <Link to="/app/importar">
              <Button size="sm" variant="outline">
                <Upload className="size-4" />
                Importar reservas
              </Button>
            </Link>
            <Link to="/app/tarefas/nova">
              <Button size="sm">
                <Plus className="size-4" />
                Nova tarefa
              </Button>
            </Link>
          </div>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Próximos passos de implementação</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. Kanban de limpezas (/app/kanban)</p>
          <p>2. CRUD de Unidades (/app/unidades)</p>
          <p>3. Gestão de usuários e permissões (/app/usuarios)</p>
          <p>4. Alertas e métricas</p>
        </CardContent>
      </Card>
    </div>
  );
}
