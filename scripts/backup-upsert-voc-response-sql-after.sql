-- Upsert voc_response (ENqJyEuulA0vzoI6) — após fix: um bind jsonb $1 (sem CSV)
-- queryReplacement (n8n):
-- ={{ JSON.stringify({ source_response_id, client_id, analytical_cycle_code, score, nps_category, question_key, question_text, answer_text, answer_hash, submitted_at, source_updated_at }) }}

WITH payload AS (
  SELECT *
  FROM jsonb_to_record($1::jsonb) AS x(
    source_response_id text,
    client_id text,
    analytical_cycle_code text,
    score numeric,
    nps_category text,
    question_key text,
    question_text text,
    answer_text text,
    answer_hash text,
    submitted_at timestamptz,
    source_updated_at timestamptz
  )
)
INSERT INTO analytics_nps.voc_responses (...)
SELECT ... FROM payload x
ON CONFLICT (source_response_id, question_key) DO UPDATE SET ...
RETURNING id AS voc_response_id;
