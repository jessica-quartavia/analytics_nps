-- Import BASE0 via RPC (service_role). Schema base0 permanece fora da Data API.

CREATE OR REPLACE FUNCTION public.base0_import_run_start(
  p_source_name text,
  p_source_version text,
  p_files jsonb,
  p_imported_by text DEFAULT 'base0_import_run_start'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = base0, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO base0.import_runs (source_name, source_version, status, files, imported_by)
  VALUES (p_source_name, p_source_version, 'running', coalesce(p_files, '[]'::jsonb), p_imported_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.base0_import_run_finish(
  p_run_id uuid,
  p_status text,
  p_row_counts jsonb DEFAULT '{}'::jsonb,
  p_warnings jsonb DEFAULT '[]'::jsonb,
  p_errors jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = base0, public
AS $$
BEGIN
  UPDATE base0.import_runs
  SET
    status = p_status,
    finished_at = now(),
    row_counts = coalesce(p_row_counts, row_counts),
    warnings = coalesce(p_warnings, warnings),
    errors = coalesce(p_errors, errors)
  WHERE id = p_run_id;
END;
$$;

-- Ver migration 20261006183000_import_validations_audit.sql (colunas de auditoria + RPC).

CREATE OR REPLACE FUNCTION public.base0_import_batch(p_entity text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = base0, public
AS $$
DECLARE
  conflict_col text;
  upd_set text;
  ins_cols text;
  sel_cols text;
  n int;
  allowed text[] := ARRAY[
    'clientes',
    'mecanismos_cliente',
    'pagamentos_programa',
    'nps_respostas',
    'reunioes',
    'transferencias_ep',
    'acordos_reembolso',
    'reembolsos_omie',
    'cotas_mecanismos',
    'pagantes_fora_base_qv',
    'divergencias',
    'premissas',
    'mapa_mecanismos'
  ];
BEGIN
  IF p_entity IS NULL OR NOT (p_entity = ANY (allowed)) THEN
    RAISE EXCEPTION 'base0_import_batch: entidade não permitida: %', p_entity;
  END IF;

  conflict_col := CASE p_entity
    WHEN 'clientes' THEN 'codigo_cliente'
    WHEN 'mecanismos_cliente' THEN 'id_vinculo'
    WHEN 'mapa_mecanismos' THEN 'mecanismo_id'
    ELSE 'dedupe_key'
  END;

  SELECT
    string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('src.%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO ins_cols, sel_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'base0'
    AND c.table_name = p_entity
    AND c.column_name NOT IN ('id', 'imported_at');

  upd_set := (
    SELECT string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ' ORDER BY c.ordinal_position)
    FROM information_schema.columns c
    WHERE c.table_schema = 'base0'
      AND c.table_name = p_entity
      AND c.column_name NOT IN ('id', conflict_col, 'imported_at')
  );

  upd_set := upd_set || ', imported_at = now()';

  EXECUTE format(
    $q$
    WITH src AS (
      SELECT * FROM jsonb_populate_recordset(null::base0.%I, $1)
    ),
    ups AS (
      INSERT INTO base0.%I (%s)
      SELECT %s FROM src
      ON CONFLICT (%I) DO UPDATE SET %s
      RETURNING 1
    )
    SELECT count(*)::int FROM ups
    $q$,
    p_entity,
    p_entity,
    ins_cols,
    sel_cols,
    conflict_col,
    upd_set
  ) INTO n USING p_rows;

  RETURN coalesce(n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.base0_import_sanity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = base0, public
STABLE
AS $$
DECLARE
  out jsonb := '{}'::jsonb;
  rec record;
BEGIN
  FOR rec IN
    SELECT 'clientes' AS t, count(*)::int AS total, count(*) FILTER (WHERE base_qv_id IS NOT NULL)::int AS with_match FROM base0.clientes
    UNION ALL
    SELECT 'pagamentos_programa', count(*)::int, count(*) FILTER (WHERE base_qv_id IS NOT NULL)::int FROM base0.pagamentos_programa
    UNION ALL
    SELECT 'nps_respostas', count(*)::int, count(*) FILTER (WHERE base_qv_id IS NOT NULL)::int FROM base0.nps_respostas
    UNION ALL
    SELECT 'reembolsos_omie', count(*)::int, count(*) FILTER (WHERE base_qv_id IS NOT NULL)::int FROM base0.reembolsos_omie
    UNION ALL
    SELECT 'reunioes', count(*)::int, count(*) FILTER (WHERE base_qv_id IS NOT NULL)::int FROM base0.reunioes
  LOOP
    out := out || jsonb_build_object(
      rec.t,
      jsonb_build_object(
        'total', rec.total,
        'with_match', rec.with_match,
        'without_match', rec.total - rec.with_match
      )
    );
  END LOOP;

  out := out || jsonb_build_object(
    'pagamentos_match',
    (
      SELECT jsonb_build_object(
        'com_match', count(*) FILTER (WHERE match_por IS NOT NULL AND match_por <> 'Sem match'),
        'sem_match', count(*) FILTER (WHERE match_por IS NULL OR match_por = 'Sem match')
      )
      FROM base0.pagamentos_programa
    )
  );

  out := out || jsonb_build_object(
    'mecanismos_por_status',
    coalesce(
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'n', n) ORDER BY n DESC)
       FROM (SELECT status, count(*)::int AS n FROM base0.mecanismos_cliente GROUP BY status) s),
      '[]'::jsonb
    )
  );

  out := out || jsonb_build_object(
    'divergencias_por_tipo',
    coalesce(
      (SELECT jsonb_agg(jsonb_build_object('tipo_divergencia', tipo_divergencia, 'n', n) ORDER BY n DESC)
       FROM (SELECT tipo_divergencia, count(*)::int AS n FROM base0.divergencias GROUP BY tipo_divergencia) d),
      '[]'::jsonb
    )
  );

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.base0_import_run_start(text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.base0_import_run_finish(uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.base0_import_validations(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.base0_import_batch(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.base0_import_sanity() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.base0_import_run_start(text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base0_import_run_finish(uuid, text, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.base0_import_validations(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.base0_import_batch(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.base0_import_sanity() TO service_role;
