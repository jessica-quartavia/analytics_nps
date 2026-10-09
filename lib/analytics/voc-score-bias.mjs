/**
 * Nota NPS como tendência auxiliar — nunca substitui o texto.
 * @param {number|null|undefined} score
 */
export function scoreToExpectedSentimentBias(score) {
  if (score == null || Number.isNaN(Number(score))) return 'unknown';
  const n = Number(score);
  if (n <= 6) return 'negative';
  if (n <= 8) return 'neutral';
  return 'positive';
}

export function scoreToNpsCategoryHint(score) {
  const bias = scoreToExpectedSentimentBias(score);
  if (bias === 'negative') return 'Detrator';
  if (bias === 'positive') return 'Promotor';
  if (bias === 'neutral') return 'Neutro';
  return null;
}

/**
 * @param {number|null|undefined} score
 */
export function isDetractorScore(score) {
  return scoreToExpectedSentimentBias(score) === 'negative';
}

/**
 * @param {number|null|undefined} score
 */
export function isPromoterScore(score) {
  return scoreToExpectedSentimentBias(score) === 'positive';
}
