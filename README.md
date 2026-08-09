# BSB Stay & Help Estadias — Módulo Operacional

Sistema interno de gestão operacional (limpeza, unidades, equipe). Primeira
fase de uma plataforma maior, desenhada para crescer com os módulos de
Manutenção, Vistoria, Atendimento e Administrativo — ver `DECISIONS.md`.

Este projeto foi escrito do zero, mas informado por um protótipo construído
no Lovable (`Brasília_Operacional`) que validou o modelo de dados, os perfis
de acesso e boa parte do fluxo de UI. Onde o protótipo acertou, reaproveitamos
o desenho; onde teria virado dívida técnica (ex: demandas de vistoria como
JSON solto), corrigimos aqui desde a primeira migration.

## Stack

- **Frontend**: React 19 + TanStack Start/Router (SSR) + Tailwind v4 + shadcn/ui
- **Backend**: Supabase (Postgres + Auth + Row Level Security + Realtime)
- **Deploy**: Cloudflare Workers (via `wrangler`, sem `@cloudflare/vite-plugin` — ver DECISIONS.md)
- **Pacotes**: npm (troque para bun se preferir — o projeto não depende disso)

## Setup local

```bash
npm install
cp .env.example .env   # preencha com as credenciais do projeto Supabase
npm run dev
```

Na primeira execução, o plugin do TanStack Router gera `src/routeTree.gen.ts`
automaticamente a partir dos arquivos em `src/routes/` — não é necessário (nem
recomendado) editar esse arquivo manualmente.

## Ambientes: dev vs. produção

**Nunca desenvolva/teste contra o Supabase de produção do cliente.** Use dois
projetos Supabase separados:

| | Projeto Supabase | Quem é dono | Onde fica configurado |
|---|---|---|---|
| **Dev/local** | Um projeto seu, gratuito, só para testar | Você | `.env` local (nunca commitado) |
| **Produção** | O projeto do cliente (conta dele) | Cliente | Variáveis de ambiente no Cloudflare (secrets do Worker) |

Fluxo recomendado:
1. Crie um projeto Supabase novo (free tier) só para desenvolvimento.
2. `npx supabase link --project-ref <ref-do-dev>` e `npx supabase db push`
   aplicam as migrations nesse projeto de teste.
3. Seu `.env` local aponta só para esse projeto de dev.
4. Quando algo estiver pronto para ir ao ar, as mesmas migrations são
   aplicadas no projeto de produção (do cliente), e o deploy no Cloudflare
   usa as credenciais de produção via `wrangler secret put` — nunca via
   `.env` commitado.

Isso também reforça o que já vendemos na proposta: os dados de produção são
100% do cliente, na conta Supabase dele — o ambiente de dev é só seu, para
não misturar dado de teste com dado real da operação.

## Banco de dados

O schema vive em `supabase/migrations/`. Para aplicar num projeto Supabase:

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

Depois de aplicar, regenere os tipos TypeScript (o arquivo atual em
`src/lib/supabase/types.ts` foi escrito manualmente a partir da migration,
como ponto de partida):

```bash
npx supabase gen types typescript --project-id <ref-do-projeto> > src/lib/supabase/types.ts
```

## Estrutura

```
src/
  routes/            rotas do TanStack Router (arquivo = rota)
  components/ui/     componentes shadcn (adicione outros com `npx shadcn add <nome>`)
  components/        componentes de app (AppShell, etc.)
  lib/               auth, domain, cliente Supabase
  modules/
    operacional/      tudo específico do módulo Operacional
    _core/            conceitos compartilhados por todos os módulos (Unidade)
supabase/
  migrations/         schema versionado
```

Novos módulos (Manutenção, Vistoria, Atendimento, Administrativo) devem:
1. Ganhar uma migration própria que só ADICIONA tabelas/colunas/enum values
   (nunca altera o que o Operacional já usa em produção).
2. Viver em `src/modules/<nome>/`.
3. Se precisarem de um novo perfil de acesso, adicionar ao enum `app_role`
   via `ALTER TYPE ... ADD VALUE` — nunca remover valores existentes.

## Deploy

```bash
npm run build
npx wrangler login
npm run deploy
```

## Status

- [x] Schema inicial (Unidades, Tarefas, Vistoria Demandas, Roles/RLS)
- [x] Autenticação + shell autenticado
- [ ] Kanban de limpezas
- [ ] CRUD de Unidades + importação de reservas (CSV)
- [ ] Gestão de usuários e permissões
- [ ] Alertas e métricas
