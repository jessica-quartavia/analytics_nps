-- Business Data (project_ref rckpuebaiswrxzmywllv) ONLY.
-- VoC persistence + automation support. Does not touch BASE QV public.

CREATE SCHEMA IF NOT EXISTS analytics_nps;

-- updated_at helper
CREATE OR REPLACE FUNCTION analytics_nps.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS analytics_nps.voc_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_response_id text NOT NULL,
  client_id text,
  analytical_cycle_code text,
  score numeric,
  nps_category text,
  question_key text,
  question_text text,
  answer_text text,
  answer_hash text NOT NULL,
  submitted_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voc_responses_source_question_unique UNIQUE (source_response_id, question_key),
  CONSTRAINT voc_responses_nps_category_check CHECK (
    nps_category IS NULL OR nps_category IN ('Promotor', 'Neutro', 'Detrator')
  )
);

CREATE INDEX IF NOT EXISTS idx_voc_responses_source_response_id ON analytics_nps.voc_responses (source_response_id);
CREATE INDEX IF NOT EXISTS idx_voc_responses_client_id ON analytics_nps.voc_responses (client_id);
CREATE INDEX IF NOT EXISTS idx_voc_responses_cycle ON analytics_nps.voc_responses (analytical_cycle_code);
CREATE INDEX IF NOT EXISTS idx_voc_responses_answer_hash ON analytics_nps.voc_responses (answer_hash);
CREATE INDEX IF NOT EXISTS idx_voc_responses_submitted_at ON analytics_nps.voc_responses (submitted_at);

DROP TRIGGER IF EXISTS trg_voc_responses_updated_at ON analytics_nps.voc_responses;
CREATE TRIGGER trg_voc_responses_updated_at
  BEFORE UPDATE ON analytics_nps.voc_responses
  FOR EACH ROW EXECUTE FUNCTION analytics_nps.set_updated_at();

CREATE TABLE IF NOT EXISTS analytics_nps.voc_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voc_response_id uuid NOT NULL REFERENCES analytics_nps.voc_responses (id) ON DELETE CASCADE,
  source_response_id text NOT NULL,
  topic text NOT NULL,
  valence text NOT NULL,
  confidence numeric,
  evidence text,
  valence_reason text,
  classifier_source text NOT NULL,
  ai_provider text,
  ai_model text,
  prompt_version text,
  classifier_version text,
  input_hash text NOT NULL,
  needs_human_review boolean NOT NULL DEFAULT false,
  fallback_reason text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voc_classifications_valence_check CHECK (valence IN ('Positiva', 'Neutra', 'Negativa')),
  CONSTRAINT voc_classifications_source_check CHECK (
    classifier_source IN ('gemini', 'rules_v2_fallback', 'human_review')
  ),
  CONSTRAINT voc_classifications_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  CONSTRAINT voc_classifications_input_topic_version_unique UNIQUE (input_hash, topic, classifier_version)
);

CREATE INDEX IF NOT EXISTS idx_voc_classifications_source_response_id ON analytics_nps.voc_classifications (source_response_id);
CREATE INDEX IF NOT EXISTS idx_voc_classifications_voc_response_id ON analytics_nps.voc_classifications (voc_response_id);
CREATE INDEX IF NOT EXISTS idx_voc_classifications_topic ON analytics_nps.voc_classifications (topic);
CREATE INDEX IF NOT EXISTS idx_voc_classifications_valence ON analytics_nps.voc_classifications (valence);
CREATE INDEX IF NOT EXISTS idx_voc_classifications_classifier_source ON analytics_nps.voc_classifications (classifier_source);
CREATE INDEX IF NOT EXISTS idx_voc_classifications_needs_review ON analytics_nps.voc_classifications (needs_human_review);
CREATE INDEX IF NOT EXISTS idx_voc_classifications_classified_at ON analytics_nps.voc_classifications (classified_at);
CREATE INDEX IF NOT EXISTS idx_voc_classifications_input_hash ON analytics_nps.voc_classifications (input_hash);

CREATE TABLE IF NOT EXISTS analytics_nps.voc_classification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL,
  trigger_type text,
  provider text,
  requested_model text,
  effective_model text,
  prompt_version text,
  classifier_version text,
  responses_found integer DEFAULT 0,
  responses_processed integer DEFAULT 0,
  gemini_success integer DEFAULT 0,
  rules_fallback integer DEFAULT 0,
  low_confidence integer DEFAULT 0,
  http_429 integer DEFAULT 0,
  http_503 integer DEFAULT 0,
  timeouts integer DEFAULT 0,
  invalid_outputs integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voc_classification_runs_status_check CHECK (
    status IN ('running', 'success', 'partial', 'failed')
  ),
  CONSTRAINT voc_classification_runs_trigger_check CHECK (
    trigger_type IS NULL OR trigger_type IN ('scheduled', 'manual', 'reprocess')
  )
);

CREATE TABLE IF NOT EXISTS analytics_nps.voc_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classification_id uuid NOT NULL REFERENCES analytics_nps.voc_classifications (id) ON DELETE CASCADE,
  source_response_id text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_valence text,
  review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voc_review_queue_status_check CHECK (
    status IN ('pending', 'approved', 'corrected', 'dismissed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voc_review_queue_pending_unique
  ON analytics_nps.voc_review_queue (classification_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_voc_review_queue_status ON analytics_nps.voc_review_queue (status);
CREATE INDEX IF NOT EXISTS idx_voc_review_queue_created_at ON analytics_nps.voc_review_queue (created_at);

CREATE TABLE IF NOT EXISTS analytics_nps.voc_classifier_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classifier_version text NOT NULL UNIQUE,
  provider text,
  model text,
  prompt_version text,
  taxonomy_version text,
  is_active boolean NOT NULL DEFAULT false,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO analytics_nps.voc_classifier_versions (
  classifier_version, provider, model, prompt_version, is_active, config
)
VALUES (
  'gemini_v1',
  'gemini',
  'gemini-3.6-flash',
  'voc-gemini-prompt-v1',
  true,
  '{"low_confidence_threshold":0.65}'::jsonb
)
ON CONFLICT (classifier_version) DO UPDATE SET
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  prompt_version = EXCLUDED.prompt_version,
  is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS analytics_nps.voc_ai_cache (
  input_hash text PRIMARY KEY,
  question_text text,
  answer_text text,
  candidate_themes jsonb,
  provider text,
  model text,
  prompt_version text,
  classifier_version text,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW analytics_nps.voc_current_classifications
WITH (security_invoker = true)
AS
WITH active AS (
  SELECT classifier_version
  FROM analytics_nps.voc_classifier_versions
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1
),
ranked AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (
      PARTITION BY c.source_response_id, c.topic
      ORDER BY
        CASE c.classifier_source
          WHEN 'human_review' THEN 1
          WHEN 'gemini' THEN 2
          WHEN 'rules_v2_fallback' THEN 3
          ELSE 4
        END,
        c.classified_at DESC,
        c.created_at DESC
    ) AS rn
  FROM analytics_nps.voc_classifications c
  INNER JOIN active a ON c.classifier_version = a.classifier_version
)
SELECT
  id,
  voc_response_id,
  source_response_id,
  topic,
  valence,
  confidence,
  evidence,
  valence_reason,
  classifier_source,
  ai_provider,
  ai_model,
  prompt_version,
  classifier_version,
  input_hash,
  needs_human_review,
  fallback_reason,
  classified_at,
  created_at
FROM ranked
WHERE rn = 1;

COMMENT ON VIEW analytics_nps.voc_current_classifications IS
  'Classificação vigente por source_response_id + topic (versão ativa, desempate human_review > gemini > rules_v2_fallback).';

-- RLS: backend/n8n only (service_role bypasses RLS)
ALTER TABLE analytics_nps.voc_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.voc_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.voc_classification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.voc_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.voc_classifier_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.voc_ai_cache ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated → no client writes/reads via Data API by default.

REVOKE ALL ON SCHEMA analytics_nps FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA analytics_nps FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA analytics_nps FROM PUBLIC;

GRANT USAGE ON SCHEMA analytics_nps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics_nps TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics_nps TO service_role;
GRANT SELECT ON analytics_nps.voc_current_classifications TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics_nps
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics_nps
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

COMMENT ON SCHEMA analytics_nps IS 'Analytics NPS VoC layer — Business Data project only';
