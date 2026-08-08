# Núcleo compartilhado (`_core`)

Conceitos que todo módulo futuro (Manutenção, Vistoria, Atendimento,
Administrativo) vai depender — hoje isso é essencialmente a **Unidade**
(tabela `unidades` + `quartos_config`).

Regra: código aqui não pode importar nada de dentro de `modules/operacional`
ou de qualquer módulo futuro. A dependência é sempre módulo → core, nunca o
contrário — isso é o que mantém os módulos independentes entre si.

Nada implementado aqui ainda além do schema (`supabase/migrations/0001_init.sql`).
Quando o CRUD de Unidades for construído, os componentes compartilhados
(ex: card de detalhe da Unidade usado por vários módulos) entram aqui.
