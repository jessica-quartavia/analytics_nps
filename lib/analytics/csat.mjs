import {
  CSAT_SCORE_MIN,
  CSAT_SCORE_MAX,
  CSAT_SATISFIED_MIN_SCORE,
  CSAT_SATISFIED_RULE_ID,
} from './csat-config.mjs';

export function isValidCsatScore(score) {
  return Number.isInteger(score) && score >= CSAT_SCORE_MIN && score <= CSAT_SCORE_MAX;
}

export function isCsatSatisfied(score) {
  return isValidCsatScore(score) && score >= CSAT_SATISFIED_MIN_SCORE;
}

export function getSatisfiedRuleMeta() {
  return {
    rule_id: CSAT_SATISFIED_RULE_ID,
    min_score: CSAT_SATISFIED_MIN_SCORE,
    scale: `${CSAT_SCORE_MIN}-${CSAT_SCORE_MAX}`,
    description: 'Percentual de respostas CSAT válidas com nota >= 4 (top-2 box em escala 0–5).',
  };
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildScoreDistribution(scores) {
  const dist = {};
  for (let i = CSAT_SCORE_MIN; i <= CSAT_SCORE_MAX; i++) dist[i] = 0;
  for (const s of scores) {
    if (isValidCsatScore(s)) dist[s]++;
  }
  return dist;
}

export function summarizeCsatScores(scores) {
  const valid = scores.filter(isValidCsatScore);
  const satisfied = valid.filter(isCsatSatisfied);
  const total = valid.length;
  return {
    valid_responses: total,
    average_score: average(valid),
    median_score: median(valid),
    satisfied_responses: satisfied.length,
    satisfied_pct: total ? (satisfied.length / total) * 100 : null,
    score_distribution: buildScoreDistribution(valid),
  };
}
