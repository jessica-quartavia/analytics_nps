-- Datasets derivados (camada analítica). Populados via npm run generate:safras-cobertura (JSON) ou ETL futuro.
-- Não altera nps_historico nem BASE QV.

CREATE TABLE IF NOT EXISTS analytics_nps.customer_nps_cohorts (
  client_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_nps.customer_nps_history (
  id bigserial PRIMARY KEY,
  client_id uuid NOT NULL,
  ciclo text,
  payload jsonb NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_nps_history_client_ciclo_idx
  ON analytics_nps.customer_nps_history (client_id, ciclo);

COMMENT ON TABLE analytics_nps.customer_nps_cohorts IS '1 linha por cliente PHARUS — snapshot derivado (safra, cobertura NPS, app).';
COMMENT ON TABLE analytics_nps.customer_nps_history IS '1 linha por cliente × medição — respostas deduplicadas (current + histórico).';
