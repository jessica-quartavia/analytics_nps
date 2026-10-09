-- Revisões manuais VoC (prioridade sobre IA na materialização / view)

CREATE TABLE IF NOT EXISTS analytics_nps.voc_manual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id text NOT NULL,
  client_id text,
  analytical_cycle_code text,
  reviewer_email text NOT NULL,
  reviewer_name text,
  review_notes text,
  reviewed_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  supersedes_classifier_source text,
  previous_topics_snapshot jsonb,
  status text NOT NULL DEFAULT 'reviewed',
  active boolean NOT NULL DEFAULT true,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voc_manual_reviews_status_check CHECK (status IN ('reviewed', 'superseded'))
);

CREATE INDEX IF NOT EXISTS idx_voc_manual_reviews_response_id ON analytics_nps.voc_manual_reviews (response_id);
CREATE INDEX IF NOT EXISTS idx_voc_manual_reviews_active ON analytics_nps.voc_manual_reviews (response_id, active) WHERE active = true;

DROP TRIGGER IF EXISTS trg_voc_manual_reviews_updated_at ON analytics_nps.voc_manual_reviews;
CREATE TRIGGER trg_voc_manual_reviews_updated_at
  BEFORE UPDATE ON analytics_nps.voc_manual_reviews
  FOR EACH ROW EXECUTE FUNCTION analytics_nps.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON analytics_nps.voc_manual_reviews TO service_role;
