-- DEPRECATED
-- DO NOT APPLY
-- Project policy: databases are read-only.
-- Analytics persistence is file-based.

-- Schema analítico NPS (projeto dedicado — NÃO aplicar no BASE QV public)

CREATE SCHEMA IF NOT EXISTS analytics_nps;

-- cycles
CREATE TABLE analytics_nps.cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_cycle_id uuid,
  cycle_code text NOT NULL UNIQUE,
  cycle_name text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  reference_date date,
  status text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cycles_status_check CHECK (status IN ('draft', 'open', 'closed'))
);

CREATE INDEX idx_analytics_nps_cycles_source_cycle_id ON analytics_nps.cycles (source_cycle_id);

-- responses
CREATE TABLE analytics_nps.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  client_code text,
  client_name text,
  cycle_id uuid NOT NULL REFERENCES analytics_nps.cycles (id) ON DELETE RESTRICT,
  source_response_id uuid,
  typeform_response_id text,
  submitted_at timestamptz NOT NULL,
  score integer NOT NULL,
  nps_category text NOT NULL,
  comment text,
  program text,
  segment text,
  journey_stage text,
  ep_id uuid,
  ep_name text,
  ep_resolution_method text,
  ep_resolution_confidence text,
  cycle_resolution_method text,
  previous_response_id uuid REFERENCES analytics_nps.responses (id) ON DELETE SET NULL,
  previous_score integer,
  score_delta integer,
  previous_category text,
  nps_migration text,
  recurring_respondent boolean NOT NULL DEFAULT false,
  cycles_answered integer,
  evolution_status text,
  critical_flag boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'BASE_QV',
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT responses_client_cycle_unique UNIQUE (client_id, cycle_id),
  CONSTRAINT responses_score_check CHECK (score >= 0 AND score <= 10),
  CONSTRAINT responses_nps_category_check CHECK (nps_category IN ('Promotor', 'Neutro', 'Detrator'))
);

CREATE INDEX idx_analytics_nps_responses_cycle ON analytics_nps.responses (cycle_id);
CREATE INDEX idx_analytics_nps_responses_client ON analytics_nps.responses (client_id);
CREATE INDEX idx_analytics_nps_responses_submitted ON analytics_nps.responses (submitted_at);

-- eligible_clients
CREATE TABLE analytics_nps.eligible_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES analytics_nps.cycles (id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  client_code text,
  client_name text,
  ep_id uuid,
  ep_name text,
  program text,
  segment text,
  journey_stage text,
  status_at_cycle text,
  sent_at timestamptz,
  invited boolean NOT NULL DEFAULT true,
  responded boolean NOT NULL DEFAULT false,
  response_id uuid REFERENCES analytics_nps.responses (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eligible_clients_cycle_client_unique UNIQUE (cycle_id, client_id)
);

CREATE INDEX idx_analytics_nps_eligible_cycle ON analytics_nps.eligible_clients (cycle_id);

-- response_topics
CREATE TABLE analytics_nps.response_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES analytics_nps.responses (id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  topic text NOT NULL,
  valence text NOT NULL,
  confidence numeric,
  classification_source text,
  reviewed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT response_topics_valence_check CHECK (valence IN ('Positiva', 'Neutra', 'Negativa'))
);

-- action_queue
CREATE TABLE analytics_nps.action_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid REFERENCES analytics_nps.responses (id) ON DELETE SET NULL,
  client_id uuid NOT NULL,
  cycle_id uuid NOT NULL REFERENCES analytics_nps.cycles (id) ON DELETE RESTRICT,
  priority text NOT NULL,
  reason text NOT NULL,
  client_name text,
  ep_id uuid,
  ep_name text,
  previous_score integer,
  current_score integer,
  score_delta integer,
  nps_migration text,
  comment text,
  status text NOT NULL DEFAULT 'Novo',
  owner text,
  action_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_queue_priority_check CHECK (priority IN ('Alta', 'Média', 'Aprendizado', 'Investigar')),
  CONSTRAINT action_queue_status_check CHECK (status IN ('Novo', 'Em análise', 'Contatado', 'Em acompanhamento', 'Resolvido')),
  CONSTRAINT action_queue_cycle_client_unique UNIQUE (cycle_id, client_id)
);

-- refresh_runs
CREATE TABLE analytics_nps.refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz,
  finished_at timestamptz,
  cycle_id uuid REFERENCES analytics_nps.cycles (id) ON DELETE SET NULL,
  status text,
  responses_read integer,
  responses_loaded integer,
  responses_rejected integer,
  eligible_clients integer,
  duplicate_count integer,
  warning_count integer,
  error_count integer,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- data_quality_log
CREATE TABLE analytics_nps.data_quality_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_run_id uuid REFERENCES analytics_nps.refresh_runs (id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES analytics_nps.cycles (id) ON DELETE SET NULL,
  severity text NOT NULL,
  check_name text NOT NULL,
  client_id uuid,
  source_record_id text,
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_quality_log_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

CREATE INDEX idx_analytics_nps_dql_run ON analytics_nps.data_quality_log (refresh_run_id);

COMMENT ON SCHEMA analytics_nps IS 'Camada analítica NPS — separada do BASE QV public';
