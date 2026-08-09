-- ============================================================
-- Fecha uma condição de corrida na importação de reservas via CSV
-- (src/routes/app.importar.tsx): o dedup por reserva_numero hoje é feito
-- em código antes da gravação (SELECT ... WHERE reserva_numero IN (...)),
-- o que não impede duas importações concorrentes de passarem pelo mesmo
-- SELECT antes de qualquer uma delas gravar, criando tarefas duplicadas
-- para a mesma reserva. Um índice único parcial faz o Postgres recusar o
-- segundo INSERT — a aplicação trata esse erro como "já importado por
-- outra pessoa" e segue com o resto do lote.
--
-- Parcial (WHERE reserva_numero IS NOT NULL) porque nem toda tarefa vem
-- de uma reserva importada — tarefas criadas manualmente (Nova tarefa)
-- não têm reserva_numero, e múltiplos NULLs não devem conflitar entre si.
-- ============================================================

CREATE UNIQUE INDEX idx_tarefas_reserva_numero_unique
  ON public.tarefas(reserva_numero)
  WHERE reserva_numero IS NOT NULL;
