-- Plano de Ação — classificações Gemini + revisão humana

CREATE TABLE IF NOT EXISTS analytics_nps.action_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  theme text,
  priority text,
  urgency text,
  action_category text,
  suggested_owner_area text,
  confidence numeric(5, 4),
  reason text,
  evidence text,
  classifier_source text NOT NULL DEFAULT 'gemini',
  ai_provider text,
  ai_model text,
  prompt_version text NOT NULL,
  model text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  input_hash text NOT NULL,
  needs_human_review boolean NOT NULL DEFAULT false,
  fallback_reason text,
  CONSTRAINT action_classifications_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  CONSTRAINT action_classifications_source_hash_unique UNIQUE (source_id, input_hash, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_action_classifications_source_id
  ON analytics_nps.action_classifications (source_id);
CREATE INDEX IF NOT EXISTS idx_action_classifications_classified_at
  ON analytics_nps.action_classifications (classified_at);
CREATE INDEX IF NOT EXISTS idx_action_classifications_needs_review
  ON analytics_nps.action_classifications (needs_human_review);

CREATE TABLE IF NOT EXISTS analytics_nps.action_manual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  theme text,
  priority text,
  urgency text,
  action_category text,
  suggested_owner_area text,
  review_notes text,
  reviewer_email text NOT NULL,
  reviewer_name text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  supersedes_classifier_source text,
  previous_snapshot jsonb,
  CONSTRAINT action_manual_reviews_source_unique UNIQUE (source_id)
);

CREATE INDEX IF NOT EXISTS idx_action_manual_reviews_reviewed_at
  ON analytics_nps.action_manual_reviews (reviewed_at);

ALTER TABLE analytics_nps.action_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.action_manual_reviews ENABLE ROW LEVEL SECURITY;
