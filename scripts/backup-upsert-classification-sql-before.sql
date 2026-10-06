-- Backup: Upsert Classification (ENqJyEuulA0vzoI6) — antes do fix jsonb $1
-- ON CONFLICT (input_hash, topic, classifier_version)

INSERT INTO analytics_nps.voc_classifications (voc_response_id, source_response_id, topic, valence, confidence, evidence, valence_reason, classifier_source, ai_provider, ai_model, prompt_version, classifier_version, input_hash, needs_human_review, fallback_reason, classified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()) ON CONFLICT (input_hash, topic, classifier_version) DO UPDATE SET valence=EXCLUDED.valence, confidence=EXCLUDED.confidence, evidence=EXCLUDED.evidence, valence_reason=EXCLUDED.valence_reason, classifier_source=EXCLUDED.classifier_source, needs_human_review=EXCLUDED.needs_human_review, classified_at=NOW() RETURNING id AS classification_id, needs_human_review;

-- queryReplacement (CSV — vírgulas em evidence/valence_reason deslocam $14 needs_human_review):
-- $1 unit.voc_response_id, $2 unit.source_response_id, $3 topic, $4 valence, $5 confidence,
-- $6 evidence, $7 valence_reason, $8 classifier_source, $9 ai_provider, $10 ai_model,
-- $11 classify.prompt_version, $12 classify.classifier_version, $13 unit.input_hash,
-- $14 needs_human_review, $15 classify.fallback_reason
