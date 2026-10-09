/** Prioridade para publicação dashboard: human > gemini v3 > gemini > rules */

const PROMPT_RANK = {
  'voc-gemini-prompt-v3': 0,
  'voc-gemini-prompt-v2': 1,
  'voc-gemini-prompt-v1': 2,
};

export function classificationPublishRank(row) {
  const src = row.classifier_source ?? row.classification_source ?? '';
  if (src === 'human_review') return 0;
  if (src === 'gemini') {
    const pv = row.prompt_version ?? '';
    return 10 + (PROMPT_RANK[pv] ?? 5);
  }
  if (src === 'rules_v2_fallback') return 50;
  if (src === 'rules_v2') return 60;
  return 70;
}

/**
 * @param {Array<object>} rows same response_id + topic
 */
export function pickBestClassificationRow(rows) {
  if (!rows?.length) return null;
  return [...rows].sort((a, b) => {
    const ra = classificationPublishRank(a);
    const rb = classificationPublishRank(b);
    if (ra !== rb) return ra - rb;
    const ta = new Date(a.classified_at ?? a.created_at ?? 0).getTime();
    const tb = new Date(b.classified_at ?? b.created_at ?? 0).getTime();
    return tb - ta;
  })[0];
}
