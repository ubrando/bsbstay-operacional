import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/app/")({
  component: Painel,
});

function Painel() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Painel Operacional</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Próximos passos de implementação</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. Kanban de limpezas (/app/kanban)</p>
          <p>2. CRUD de Unidades (/app/unidades)</p>
          <p>3. Gestão de usuários e permissões (/app/usuarios)</p>
          <p>4. Importação de reservas via CSV (Ayrton)</p>
          <p>5. Alertas e métricas</p>
        </CardContent>
      </Card>
    </div>
  );
}
