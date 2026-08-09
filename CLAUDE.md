# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

Módulo Operacional (limpeza, unidades, equipe) de uma plataforma maior para
a BSB Stay & Help Estadias. É a primeira de várias fases — Manutenção,
Vistoria, Atendimento e Administrativo vêm depois, como novos módulos no
mesmo app. Informado por um protótipo Lovable (`Brasília_Operacional`) que
validou modelo de dados e UI, mas reescrito do zero para evitar dívida
técnica que o protótipo teria carregado. O raciocínio de cada decisão de
arquitetura relevante está em `DECISIONS.md` — leia antes de propor mudanças
estruturais (schema, hospedagem, enums de perfil).

## Comandos

```bash
npm install
cp .env.example .env   # preencher com credenciais do Supabase de DEV (nunca produção)
npm run dev             # vite dev
npm run build            # vite build
npm run preview          # preview do build
npm run lint              # eslint .
npm run format             # prettier --write .
npm run deploy               # build + wrangler deploy
```

Não há suíte de testes configurada neste projeto ainda.

`src/routeTree.gen.ts` é gerado automaticamente pelo plugin do TanStack
Router a partir dos arquivos em `src/routes/` na primeira execução do dev
server — nunca editar manualmente (está no `.gitignore` e ignorado no
eslint).

### Banco de dados (Supabase)

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
npx supabase gen types typescript --project-id <ref-do-projeto> > src/lib/supabase/types.ts
```

**Nunca desenvolva/teste contra o Supabase de produção do cliente.** Use um
projeto Supabase free tier separado para dev, apontado no `.env` local; a
produção é o projeto do cliente, configurado só via secrets do Cloudflare
Worker (`wrangler secret put`), nunca via `.env` commitado.

`src/lib/supabase/types.ts` foi escrito manualmente a partir da migration
inicial como ponto de partida — regenere com o comando acima depois de
aplicar novas migrations.

## Arquitetura

**Stack**: React 19 + TanStack Start/Router (SSR, roteamento file-based) +
Tailwind v4 + shadcn/ui (estilo "new-york") no frontend; Supabase (Postgres +
Auth + Row Level Security + Realtime) no backend; deploy em Cloudflare
Workers via `wrangler`.

### Deploy: Cloudflare sem `@cloudflare/vite-plugin`

O protótipo já vinha configurado para Cloudflare Workers, e essa escolha foi
mantida (tier gratuito de 100k requisições/dia deve cobrir os ~50 usuários
internos esperados, custo bem abaixo do que a proposta original assumia com
Railway/Render). Mas **não reintroduza `@cloudflare/vite-plugin`**: ele só
adiciona valor quando o app usa bindings do runtime Workers (KV, R2, D1)
durante o `vite dev`, e este app só chama a API do Supabase via HTTP. Sem
o plugin, `npm run build` já gera exatamente a estrutura que
`wrangler.jsonc` espera (`dist/client` + `dist/server/server.js`), e
`wrangler deploy` funciona direto — com o plugin, a build falhava porque ele
verificava a existência de `dist/server/server.js` **antes** do build gerar
esse arquivo (bug de ordem de execução, não de configuração).

### Módulos: a regra de dependência

```
src/modules/
  operacional/   tudo específico do módulo Operacional
  _core/         conceitos compartilhados por todos os módulos (Unidade)
```

Cada módulo futuro (Manutenção, Vistoria, Atendimento, Administrativo) vive
em seu próprio `src/modules/<nome>/`. A regra fixa é: **módulo → `_core`,
nunca o contrário, e nunca módulo → módulo**. `_core` não pode importar nada
de `modules/operacional` ou de qualquer módulo futuro — isso é o que mantém
os módulos independentes entre si. `unidades` (tabela + `quartos_config`) é
o núcleo compartilhado hoje; componentes de UI compartilhados entre módulos
(ex: card de detalhe de Unidade) devem entrar em `_core`, não em
`operacional`.

Ao adicionar lógica de domínio nova, prefira um `domain.ts` próprio dentro
do módulo em vez de inchar `src/lib/domain.ts` (hoje só tem os labels/helpers
do Operacional).

### Roteamento e camadas da app

- Rotas são arquivos em `src/routes/` (convenção file-based do TanStack
  Router: `app.kanban.tsx`, `app.tarefas.$id.tsx`, etc. — `.` no nome vira
  segmento de path aninhado).
- `src/routes/__root.tsx` monta `QueryClientProvider` (TanStack Query) e
  `AuthProvider` (`src/lib/auth.tsx`) ao redor de toda a app.
- `src/routes/app.tsx` é o layout autenticado: redireciona para `/login` se
  não houver sessão, mostra tela de "cadastro em análise" se o usuário for
  `pending_user`, senão renderiza `AppShell` (`src/components/AppShell.tsx`)
  com o `Outlet`.
- `src/lib/supabase/client.ts` exporta um client lazy (via `Proxy`) que só
  instancia na primeira chamada — evita erro de env var ausente no import
  time durante SSR/build.
- `src/lib/use-realtime-refresh.ts` assina `postgres_changes` do Supabase
  Realtime numa lista de tabelas e dispara um callback com debounce — é o
  padrão para telas que devem atualizar quando outro usuário mexe nos dados
  (ex: Kanban).

### Autenticação e perfis de acesso

`src/lib/auth.tsx` expõe `useAuth()` com `roles: AppRole[]` (um usuário pode
ter mais de um role). `AppRole` vem do enum Postgres `app_role`, gerado em
`src/lib/supabase/types.ts`. Grupos de roles compostos (`OPERATOR_ROLES`,
`FRONT_DESK_ROLES`) e labels (`ROLE_LABELS`) também vivem nesse arquivo.

Todo usuário novo nasce como `pending_user` (trigger `handle_new_user` na
migration) até um admin atribuir um role real via `ASSIGNABLE_ROLES`.

O enum começou enxuto de propósito: o protótipo tinha `admin` e
`operational_user` como sinônimos redundantes de `operacional`/`manager`,
acumulados por iterações do gerador. Ao adicionar um perfil de acesso para
um módulo novo, adicione ao enum via `ALTER TYPE app_role ADD VALUE` numa
migration nova — **nunca remova ou renomeie valores existentes**, isso
quebraria dados em produção.

### Banco de dados: convenções de migration

Schema versionado em `supabase/migrations/` (`0001_init.sql` é a base atual:
enums, `profiles`, `user_roles`, RLS, `has_role`/`has_any_role`, `unidades`,
`tarefas`, `vistoria_demandas`, etc.). Regras para migrations novas:

1. Só ADICIONAR tabelas/colunas/valores de enum — nunca alterar o que o
   Operacional já usa em produção.
2. Demandas que puderem crescer em consultas/filtros próprios merecem tabela
   normalizada desde o início, não `jsonb` solto (foi um erro identificado
   no protótipo — ver `DECISIONS.md`, "Demandas de vistoria").

### Importação de reservas

Decisão do cliente: importação via upload manual de planilha/CSV (como já
funcionava no protótipo), em vez de integração de API viva com o Ayrton por
ora. `tarefas.reserva_numero` já existe no schema para permitir cruzar com
uma import automática futura sem precisar de mudança de schema — não é um
campo morto.

### UI

Componentes shadcn ficam em `src/components/ui/`; adicionar novos com
`npx shadcn add <nome>` (config em `components.json`, alias `@/*` →
`src/*`). Componentes de app (não shadcn) ficam direto em
`src/components/` (ex: `AppShell.tsx`).