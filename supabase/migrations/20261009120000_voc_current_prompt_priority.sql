-- Prioriza human_review > Gemini (v3 > v2 > v1) > rules fallback
CREATE OR REPLACE VIEW analytics_nps.voc_current_classifications
WITH (security_invoker = true)
AS
WITH ranked AS (
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
        CASE c.prompt_version
          WHEN 'voc-gemini-prompt-v3' THEN 0
          WHEN 'voc-gemini-prompt-v2' THEN 1
          WHEN 'voc-gemini-prompt-v1' THEN 2
          ELSE 3
        END,
        c.classified_at DESC,
        c.created_at DESC
    ) AS rn
  FROM analytics_nps.voc_classifications c
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
  'Classificação vigente por source_response_id + topic (human > gemini por prompt_version > rules).';
