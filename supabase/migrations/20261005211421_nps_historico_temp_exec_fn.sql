-- RPC temporário para carga idempotente via service role (scripts/run-nps-historico-mcp-parts.mjs).
-- Escopo: executa SQL gerado a partir dos arquivos PHARUS consolidados.

CREATE OR REPLACE FUNCTION public.nps_historico_import_exec(p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nps_historico, public
AS $$
BEGIN
  IF p_sql IS NULL OR length(trim(p_sql)) = 0 THEN
    RAISE EXCEPTION 'empty sql';
  END IF;
  EXECUTE p_sql;
END;
$$;

REVOKE ALL ON FUNCTION public.nps_historico_import_exec(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nps_historico_import_exec(text) TO service_role;
