-- Business Data (rckp…) — expor schema na PostgREST / Data API.
-- Também pode ser feito no Dashboard: Settings → Data API → Exposed schemas.

ALTER ROLE authenticator SET pgrst.db_schemas TO
  public,
  graphql_public,
  storage,
  clusterizacao_pharus,
  bl_test,
  dw_bitrix,
  contracts_app,
  match_ep_pharus,
  acionamentos_tech,
  documentacao_quartavia,
  check_link_ep,
  _dashboard_ferramentas,
  analytics_nps;

NOTIFY pgrst, 'reload config';
