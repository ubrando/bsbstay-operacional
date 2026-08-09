import { createFileRoute } from "@tanstack/react-router";

// Sem `component:` aqui de propósito — ele vive em cadastro.lazy.tsx.
// O plugin de code-splitting do TanStack Router só separa automaticamente
// o que está DENTRO da função do componente; qualquer const/import no nível
// do módulo deste arquivo (schema zod, helpers) ficaria no chunk carregado
// por toda rota, inclusive /login. Usar o par .tsx + .lazy.tsx (em vez de
// um só arquivo) garante um limite físico de arquivo, não uma heurística.
export const Route = createFileRoute("/cadastro")({});
