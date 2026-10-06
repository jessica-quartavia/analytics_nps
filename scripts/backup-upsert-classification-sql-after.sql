-- Upsert Classification (ENqJyEuulA0vzoI6) — após fix: bind único $1::jsonb
-- queryReplacement:
-- ={{ JSON.stringify({ voc_response_id, source_response_id, topic, valence, confidence,
--   evidence, valence_reason, classifier_source, ai_provider, ai_model, prompt_version,
--   classifier_version, input_hash, needs_human_review, fallback_reason }) }}

WITH payload AS (
  SELECT *
  FROM jsonb_to_record($1::jsonb) AS x(
    voc_response_id uuid,
    source_response_id text,
    topic text,
    valence text,
    confidence numeric,
    evidence text,
    valence_reason text,
    classifier_source text,
    ai_provider text,
    ai_model text,
    prompt_version text,
    classifier_version text,
    input_hash text,
    needs_human_review boolean,
    fallback_reason text
  )
)
INSERT INTO analytics_nps.voc_classifications (
  voc_response_id, source_response_id, topic, valence, confidence, evidence,
  valence_reason, classifier_source, ai_provider, ai_model, prompt_version,
  classifier_version, input_hash, needs_human_review, fallback_reason, classified_at
)
SELECT
  x.voc_response_id, x.source_response_id, x.topic, x.valence, x.confidence, x.evidence,
  x.valence_reason, x.classifier_source, x.ai_provider, x.ai_model, x.prompt_version,
  x.classifier_version, x.input_hash, x.needs_human_review, x.fallback_reason, NOW()
FROM payload x
ON CONFLICT (input_hash, topic, classifier_version) DO UPDATE SET
  valence = EXCLUDED.valence,
  confidence = EXCLUDED.confidence,
  evidence = EXCLUDED.evidence,
  valence_reason = EXCLUDED.valence_reason,
  classifier_source = EXCLUDED.classifier_source,
  needs_human_review = EXCLUDED.needs_human_review,
  classified_at = NOW()
RETURNING id AS classification_id, needs_human_review;
