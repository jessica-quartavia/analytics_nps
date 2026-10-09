/**
 * Seleciona casos para classificação Gemini (prioriza risco operacional).
 */
export function scoreActionEntryForClassification(entry) {
  let score = 0;
  const nps = Number(entry.current_score);
  if (!Number.isNaN(nps)) {
    if (nps <= 3) score += 120;
    else if (nps <= 6) score += 70;
    else if (nps <= 8) score += 30;
  }
  const neg = (entry.topics ?? []).filter((t) => t.valence === 'Negativa');
  score += neg.length * 25;
  const delta = Number(entry.score_delta);
  if (!Number.isNaN(delta)) {
    if (delta <= -4) score += 45;
    else if (delta <= -2) score += 25;
  }
  if (entry.current_category === 'Detrator') score += 35;
  if (entry.consecutive_detractor) score += 20;
  if (!entry.ai_classifier_source) score += 40;
  return score;
}

export function selectActionEntriesForClassification(entries, limit = 25) {
  const ranked = [...(entries ?? [])]
    .map((e) => ({ entry: e, score: scoreActionEntryForClassification(e) }))
    .sort((a, b) => b.score - a.score || (Number(a.entry.current_score) - Number(b.entry.current_score)));
  const batch = new Set(ranked.slice(0, limit).map((r) => r.entry.response_id ?? r.entry.client_id));
  return { batchIds: batch, ranked: ranked.slice(0, limit) };
}
