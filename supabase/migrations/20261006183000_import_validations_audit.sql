-- Auditoria explícita: linhas lidas vs únicas gravadas (BASE0 import)

ALTER TABLE base0.import_validations
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS rows_read integer,
  ADD COLUMN IF NOT EXISTS rows_valid integer,
  ADD COLUMN IF NOT EXISTS rows_unique_written integer,
  ADD COLUMN IF NOT EXISTS rows_collapsed_by_dedupe integer,
  ADD COLUMN IF NOT EXISTS dedupe_rule text,
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE base0.import_validations
  ALTER COLUMN metric_key DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_base0_import_validations_run_entity
  ON base0.import_validations (import_run_id, entity)
  WHERE entity IS NOT NULL;

CREATE OR REPLACE FUNCTION public.base0_import_validations(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = base0, public
AS $$
BEGIN
  INSERT INTO base0.import_validations (
    import_run_id,
    entity,
    source_file,
    rows_read,
    rows_valid,
    rows_unique_written,
    rows_collapsed_by_dedupe,
    dedupe_rule,
    status,
    notes,
    metric_key,
    expected_count,
    actual_count
  )
  SELECT
    (r->>'import_run_id')::uuid,
    r->>'entity',
    r->>'source_file',
    (r->>'rows_read')::integer,
    (r->>'rows_valid')::integer,
    (r->>'rows_unique_written')::integer,
    (r->>'rows_collapsed_by_dedupe')::integer,
    r->>'dedupe_rule',
    r->>'status',
    r->>'notes',
    coalesce(r->>'metric_key', r->>'entity'),
    (r->>'expected_count')::integer,
    (r->>'actual_count')::integer
  FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS r;
END;
$$;
