# Decisões técnicas

Registro do porquê de cada escolha importante — para o cliente entender o
raciocínio, e para nós (ou quem continuar o projeto) não repetir perguntas
já respondidas.

## Por que reescrever em vez de continuar direto no export do Lovable

O protótipo (`Brasília_Operacional`) provou o modelo de dados e boa parte da
UI, mas veio com convenções do gerador (nomenclatura inconsistente de roles,
lockfile do Lovable, dependências não usadas) que valia mais a pena recomeçar
limpo do que ir corrigindo por cima. O schema e os componentes principais
foram trazidos por consulta direta, não copiados às cegas.

## Perfis de acesso (`app_role`)

O protótipo tinha `admin` e `operational_user` como sinônimos redundantes de
`operacional`/`manager`, provavelmente acumulados por iterações do Lovable.
Aqui, o enum começa enxuto: `camareira`, `vistoriador`, `atendimento`,
`operacional`, `manager`, `super_admin`, `pending_user`. Perfis de
Manutenção/Vistoria/Atendimento-avançado/Administrativo entram como novos
valores quando os módulos forem construídos — Postgres permite
`ALTER TYPE ... ADD VALUE` sem quebrar nada existente.

## Demandas de vistoria: tabela própria desde o início

No protótipo, isso era um array `jsonb` dentro de `tarefas`. Funciona para o
Operacional isolado, mas o módulo de Vistoria (Fase 3, futura) vai precisar
consultar, filtrar e cruzar essas demandas com dados próprios — impossível de
fazer bem com JSON solto. Criamos `vistoria_demandas` como tabela normalizada
desde a migration inicial, evitando a migração de dados que seria necessária
mais tarde.

## Importação do Ayrton: CSV manual (por ora)

Decisão do cliente: manter a importação de reservas via upload de
planilha/CSV (como já funcionava no protótipo), em vez de construir uma
integração de API viva com o Ayrton agora. Fica documentado como trabalho
futuro — o campo `tarefas.reserva_numero` já existe para permitir cruzar com
uma import automática depois, sem mudança de schema.

## Hospedagem: Cloudflare em vez de Railway/Render

O protótipo já vinha configurado para Cloudflare Workers (`wrangler.jsonc`,
`@cloudflare/vite-plugin`). Mantivemos a decisão de usar Cloudflare, mas
**removemos o `@cloudflare/vite-plugin`** depois de descobrir que ele só
adiciona valor quando o app usa bindings específicos do runtime Workers (KV,
R2, D1) durante o `vite dev` — este app não usa nenhum, só chama a API do
Supabase via HTTP. Sem esse plugin, `npm run build` gera exatamente a
estrutura que `wrangler.jsonc` espera (`dist/client` + `dist/server/server.js`),
e `wrangler deploy` funciona direto. Isso também resolveu um bug real: o
plugin falhava a build porque verificava a existência de
`dist/server/server.js` **antes** do build gerar esse arquivo — um problema
de ordem de execução, não de configuração.

O tier gratuito do Cloudflare Workers (100k requisições/dia) deve cobrir o
uso esperado (~50 usuários internos), o que reduz o custo recorrente
estimado na proposta comercial original (que assumia Railway/Render).

## Escopo desta fase

Só o módulo Operacional está sendo construído agora, mas a estrutura já
prevê os módulos futuros:
- A tabela `unidades` é o núcleo compartilhado — todo módulo futuro se
  conecta a ela, não duplica o cadastro do imóvel.
- `src/modules/` separa código por módulo desde já, mesmo com um módulo só.
- RLS e enums foram desenhados para crescer por adição, não por reescrita.
