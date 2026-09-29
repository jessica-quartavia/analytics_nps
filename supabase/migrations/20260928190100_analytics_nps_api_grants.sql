-- DEPRECATED
-- DO NOT APPLY
-- Project policy: databases are read-only.
-- Analytics persistence is file-based.

-- Exposição segura do schema analytics_nps para PostgREST / pipelines.
-- Aplicar SOMENTE no projeto Supabase dedicado analytics-nps.
-- Não altera public nem outros schemas.

-- Revoke default public access on new objects in this schema (defense in depth)
REVOKE ALL ON SCHEMA analytics_nps FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA analytics_nps FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA analytics_nps FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA analytics_nps FROM PUBLIC;

-- service_role: pipeline refresh (scripts usam service role key)
GRANT USAGE ON SCHEMA analytics_nps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics_nps TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics_nps TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics_nps
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics_nps
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- authenticated: somente leitura (dashboard futuro via RLS/policies por app)
-- Escrita fica exclusiva do service_role nos scripts de refresh.
GRANT USAGE ON SCHEMA analytics_nps TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics_nps TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics_nps
  GRANT SELECT ON TABLES TO authenticated;

-- anon: sem acesso ao schema analítico
-- (nenhum GRANT para anon)

COMMENT ON SCHEMA analytics_nps IS
  'NPS analytics layer. Add analytics_nps to API Exposed schemas (pgrst.db_schemas) in Dashboard.';
