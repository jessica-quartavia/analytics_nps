-- Backup: Upsert voc_response (ENqJyEuulA0vzoI6) — antes do fix jsonb $1
-- Node: n8n-nodes-base.postgres v2.7, operation executeQuery
-- queryReplacement (CSV frágil — vírgulas em answer_text deslocam $9+):

INSERT INTO analytics_nps.voc_responses (source_response_id, client_id, analytical_cycle_code, score, nps_category, question_key, question_text, answer_text, answer_hash, submitted_at, source_updated_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (source_response_id, question_key) DO UPDATE SET client_id=EXCLUDED.client_id, analytical_cycle_code=EXCLUDED.analytical_cycle_code, score=EXCLUDED.score, nps_category=EXCLUDED.nps_category, question_text=EXCLUDED.question_text, answer_text=EXCLUDED.answer_text, answer_hash=EXCLUDED.answer_hash, submitted_at=EXCLUDED.submitted_at, source_updated_at=EXCLUDED.source_updated_at, updated_at=NOW() RETURNING id AS voc_response_id;
