import { buildValenceChangeReport } from './voc-valence-impact.mjs';

const VALENCE_PT = { Positiva: 'positive', Neutra: 'neutral', Negativa: 'negative' };

export function countValences(rows) {
  const c = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) {
    const k = VALENCE_PT[r.valence];
    if (k) c[k] += 1;
  }
  return c;
}

export function matrixByNpsCategory(rows, responsesById) {
  /** @type {Record<string, Record<string, number>>} */
  const m = {
    Promotor: { Positiva: 0, Neutra: 0, Negativa: 0 },
    Neutro: { Positiva: 0, Neutra: 0, Negativa: 0 },
    Detrator: { Positiva: 0, Neutra: 0, Negativa: 0 },
  };
  for (const t of rows) {
    const r = responsesById.get(t.response_id);
    const cat = r?.nps_category ?? '—';
    if (!m[cat]) continue;
    if (m[cat][t.valence] != null) m[cat][t.valence] += 1;
  }
  return m;
}

export function buildAiVsRulesAudit(rulesRows, aiRows, responses) {
  const report = buildValenceChangeReport(rulesRows, aiRows);
  const responseById = new Map(responses.map((r) => [r.response_id, r]));

  const aiByKey = new Map(aiRows.map((r) => [`${r.response_id}\0${r.topic}`, r]));
  const rulesByKey = new Map(rulesRows.map((r) => [`${r.response_id}\0${r.topic}`, r]));

  /** @type {Array<object>} */
  const manualSample = [];

  for (const [key, ai] of aiByKey) {
    const rules = rulesByKey.get(key);
    const resp = responseById.get(ai.response_id);
    if (!rules || rules.valence === ai.valence) continue;
    if (manualSample.length < 120) {
      manualSample.push({
        client_name: resp?.client_name,
        score: resp?.score,
        topic: ai.topic,
        rules_valence: rules.valence,
        gemini_valence: ai.valence,
        gemini_confidence: ai.confidence,
        classifier_source: ai.classifier_source,
        evidence: ai.evidence,
      });
    }
  }

  const promoterNegativeAi = aiRows.filter((t) => {
    if (t.valence !== 'Negativa') return false;
    const r = responseById.get(t.response_id);
    return r && r.score >= 9;
  });

  const promoterNegativeRules = rulesRows.filter((t) => {
    if (t.valence !== 'Negativa') return false;
    const r = responseById.get(t.response_id);
    return r && r.score >= 9;
  });

  return {
    ...report,
    total_rules: rulesRows.length,
    total_ai: aiRows.length,
    valence_counts_rules: countValences(rulesRows),
    valence_counts_ai: countValences(aiRows),
    matrix_nps_ai: matrixByNpsCategory(aiRows, responseById),
    promoter_negative_ai: promoterNegativeAi.length,
    promoter_negative_rules: promoterNegativeRules.length,
    manual_divergence_sample: manualSample,
  };
}

export function buildAiQaReport({ rows, stats, config, responses }) {
  const responseById = new Map(responses.map((r) => [r.response_id, r]));
  const sources = {};
  let lowConfidence = 0;
  for (const r of rows) {
    const s = r.classifier_source ?? 'unknown';
    sources[s] = (sources[s] ?? 0) + 1;
    if (r.needs_human_review) lowConfidence += 1;
  }

  return {
    generated_at: new Date().toISOString(),
    classifier_version: config.classifierVersion,
    ai_provider: config.provider,
    ai_model: config.model,
    prompt_version: config.promptVersion,
    total_classifications: rows.length,
    classifier_sources: sources,
    gemini_classifications: sources.gemini ?? 0,
    fallback_classifications: sources.rules_v2_fallback ?? 0,
    stats: stats ?? {},
    invalid_outputs: stats?.invalid_json ?? stats?.invalid_outputs ?? 0,
    failed_calls: stats?.failed ?? stats?.failed_calls ?? 0,
    fallback_reasons: stats?.fallback_reasons ?? {},
    low_confidence_rows: lowConfidence,
    valence_counts: countValences(rows),
    matrix_nps_category: matrixByNpsCategory(rows, responseById),
    has_api_key_configured: config.hasApiKey,
  };
}
