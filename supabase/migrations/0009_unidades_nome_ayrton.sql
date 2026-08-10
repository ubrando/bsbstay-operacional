-- ============================================================
-- Reconstrução da importação de reservas (src/routes/app.importar.tsx) a
-- partir de uma export real do Ayrton: não existe coluna de código de
-- unidade limpo na planilha, só "Acomodacao" (texto livre, ex: "Fusion 622",
-- "Mercure 1212 #"). Esse texto é consistente pra mesma unidade entre
-- reservas diferentes, então vira a chave de casamento com a unidade — mas
-- é um conceito separado de unidades.codigo (nosso código interno).
--
-- Índice único parcial no mesmo padrão de idx_tarefas_reserva_numero_unique
-- (0004): parcial porque unidades cadastradas fora da importação (cadastro
-- manual) não têm nome_ayrton, e múltiplos NULLs não devem conflitar entre
-- si.
-- ============================================================

ALTER TABLE public.unidades ADD COLUMN nome_ayrton TEXT;

CREATE UNIQUE INDEX idx_unidades_nome_ayrton_unique
  ON public.unidades(nome_ayrton)
  WHERE nome_ayrton IS NOT NULL;
