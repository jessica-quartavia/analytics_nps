WITH payload AS (
  SELECT *
  FROM jsonb_to_record($1::jsonb) AS x(
    input_hash text,
    question_text text,
    answer_text text,
    candidate_themes jsonb,
    provider text,
    model text,
    prompt_version text,
    classifier_version text,
    result jsonb
  )
)
INSERT INTO analytics_nps.voc_ai_cache (
  input_hash, question_text, answer_text, candidate_themes, provider, model,
  prompt_version, classifier_version, result, last_used_at
)
SELECT
  x.input_hash, x.question_text, x.answer_text, x.candidate_themes, x.provider, x.model,
  x.prompt_version, x.classifier_version, x.result, NOW()
FROM payload x
ON CONFLICT (input_hash) DO UPDATE SET
  result = EXCLUDED.result,
  last_used_at = NOW();