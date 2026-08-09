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
- `src/routes/__root.tsx` monta só `QueryClientProvider` (TanStack Query) ao
  redor de toda a app — não monta `AuthProvider`, de propósito (ver seção de
  Performance abaixo: `/login` não deve precisar do client do Supabase no
  carregamento inicial).
- `src/routes/app.tsx` é o layout autenticado: monta `AuthProvider`
  (`src/lib/auth.tsx`) só para a árvore `/app/*`, redireciona para `/login`
  se não houver sessão, mostra tela de "cadastro em análise" se o usuário for
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

### Formulários

`react-hook-form` + `@hookform/resolvers` + `zod` são dependências do
projeto desde o início (não foram usadas até `cadastro.tsx`) — esse é o
padrão pra formulário novo com validação de campo, em vez de cada tela
inventar seu próprio esquema de `useState` + checagem manual no submit.

```tsx
const schema = z.object({ email: z.string().email("E-mail inválido") /* ... */ });
type FormData = z.infer<typeof schema>;

const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
  resolver: zodResolver(schema),
  mode: "onTouched",
  defaultValues: { email: "" /* ... */ },
});
```

Erro de campo renderiza logo abaixo do próprio `<Input {...register("x")} />`
via `errors.x?.message` — nunca um alert genérico no topo do formulário.
`handleSubmit(async (data) => {...})` só chama a função passada depois que o
zod validar tudo; erro de API (ex: e-mail já cadastrado) continua sendo
tratado à parte com `toast.error`, já que zod não sabe disso sem round-trip.
Para feedback ao vivo (ex: checklist de força de senha) que precisa
recalcular a cada tecla independente do modo de validação do formulário,
derive direto de `watch("campo")` em vez de depender de `errors`.

Se o schema zod (ou qualquer import só do formulário) for declarado fora do
componente num arquivo de rota de um único arquivo, ele vaza pro bundle
compartilhado — ver a seção de Performance abaixo, "segundo precedente".
Rota nova com formulário zod nasce como par `.tsx` + `.lazy.tsx`.

As telas mais antigas (`app.tarefas.nova.tsx`, `app.unidades.nova.tsx`,
etc.) ainda usam `useState` por campo — não precisam ser migradas por causa
disso sozinho, mas um formulário **novo** com regras de validação não
triviais deve nascer usando esse padrão.

## Performance / tamanho de bundle

As camareiras usam o sistema pelo celular, muitas vezes com sinal fraco na
propriedade. O carregamento inicial (especialmente `/login` e o Kanban)
precisa ficar leve. Regras permanentes:

- Sempre que uma dependência nova e pesada for adicionada (bibliotecas de
  gráfico, exportação de PDF/Excel, editor de texto rico, etc.), confirme
  que ela só é carregada na tela que realmente precisa dela (import
  dinâmico), não no bundle compartilhado.
- Depois de adicionar uma rota ou dependência nova, rode `npm run build` e
  confira o tamanho dos chunks no output. Se algum chunk passar de
  ~300-400kB, isso é um sinal de atenção — investigue antes de considerar a
  tarefa concluída, não só ignore o aviso do Vite.
- Ao implementar qualquer tela nova, pense: "isso precisa carregar no
  primeiro acesso (login/painel), ou só quando o usuário navegar pra cá?"
  Se for a segunda opção, garanta que está numa rota separada (o TanStack
  Router já faz isso automaticamente por arquivo de rota, mas confirme).

Precedente: `/login` já teve esse problema — `AuthProvider` estava montado
em `__root.tsx` (rodando em toda rota, inclusive login) e isso arrastava o
SDK inteiro do Supabase (auth-js + postgrest-js + storage-js + realtime-js
+ functions-js) para o bundle bloqueante da primeira tela. A correção não
foi `manualChunks` — foi mover `AuthProvider` para dentro de `app.tsx` (só
onde `useAuth()` é de fato consumido) e trocar o `import` estático do
client do Supabase em `login.tsx` por `import()` dinâmico dentro do handler
de submit. `@supabase/supabase-js` também merece atenção à parte: seu
`createClient()` instancia `StorageClient` e `RealtimeClient`
incondicionalmente no construtor, então qualquer código que importe o
client estaticamente carrega essas duas dependências mesmo sem usar
Storage/Functions — isso não dá pra tree-shakear, só evitar adiando o
`import()` do client para o momento em que ele é realmente necessário.

Segundo precedente, mais sutil: o code-splitting automático do
`@tanstack/router-plugin` (um arquivo de rota só, com `component:` apontando
pra uma função no mesmo arquivo) separa em chunk lazy só o que está **dentro**
da função do componente. Qualquer `const`/`import` no nível do módulo do
arquivo de rota (um schema zod definido fora do componente, por exemplo) fica
no "módulo principal" da rota — que é carregado eager, no bundle
compartilhado, mesmo que só o componente lazy use esse schema. Foi assim que
`zod` (usado só em `cadastro.tsx`) vazou pro chunk que `/login` também
carrega: ~55kB a mais no bundle bloqueante de toda rota, só por causa de um
`z.object({...})` declarado fora da função do componente. A correção não foi
mover o schema pra dentro do componente (recriaria o objeto zod a cada
render) — foi separar em dois arquivos usando a convenção oficial do
TanStack Router: `cadastro.tsx` só com `createFileRoute("/cadastro")({})`
(sem `component`), e `cadastro.lazy.tsx` com `createLazyFileRoute("/cadastro")({ component: CadastroPage })`
carregando o resto (schema, imports pesados, o componente em si). Isso cria
um limite de **arquivo**, não uma heurística de AST — garantido pelo bundler,
não por convenção. Regra: qualquer rota que declare algo pesado (zod,
qualquer lib nova) fora da função do componente deve nascer já como par
`.tsx` + `.lazy.tsx`; depois de implementar, sempre confirme rodando
`npm run build` e checando se a dependência nova aparece no chunk
compartilhado (grep por um símbolo característico dela nos chunks
`index-*.js`), não só se o chunk da própria rota existe.