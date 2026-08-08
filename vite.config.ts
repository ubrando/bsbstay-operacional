import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// Não usamos o plugin @cloudflare/vite-plugin aqui: ele serve para emular
// bindings específicos do runtime Workers (KV, R2, D1) durante o `vite dev`.
// Este app só faz chamadas HTTP ao Supabase, então não precisa disso — o
// build padrão do Vite já gera exatamente o que `wrangler deploy` espera
// (dist/client + dist/server/server.js). Ver DECISIONS.md.
export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), tanstackStart(), react()],
});
