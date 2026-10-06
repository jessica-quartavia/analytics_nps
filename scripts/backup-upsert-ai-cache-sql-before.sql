-- Upsert AI Cache — antes (CSV frágil)
INSERT INTO analytics_nps.voc_ai_cache (input_hash, question_text, answer_text, candidate_themes, provider, model, prompt_version, classifier_version, result, last_used_at)
VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb,NOW())
ON CONFLICT (input_hash) DO UPDATE SET result = EXCLUDED.result, last_used_at = NOW();
