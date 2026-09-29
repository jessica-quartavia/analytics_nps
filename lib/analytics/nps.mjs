/** @typedef {'Promotor' | 'Neutro' | 'Detrator'} NpsCategory */

/**
 * Classificação NPS oficial (0–10).
 * @param {number} score
 * @returns {NpsCategory}
 */
export function classifyNpsScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new RangeError(`score must be integer 0–10, got ${score}`);
  }
  if (score <= 6) return 'Detrator';
  if (score <= 8) return 'Neutro';
  return 'Promotor';
}

export function isValidScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= 10;
}

/**
 * Respostas válidas para NPS (score 0–10).
 * @param {Array<{ score?: number | null }>} responses
 * @param {{ skipInvalid?: boolean }} [opts]
 * @returns {Array<{ score: number }>}
 */
export function filterValidNpsResponses(responses, opts = {}) {
  const { skipInvalid = true } = opts;
  const valid = [];
  for (const r of responses) {
    if (isValidScore(r.score)) {
      valid.push(r);
      continue;
    }
    if (!skipInvalid) {
      throw new RangeError(`Invalid NPS score: ${r.score}`);
    }
  }
  return valid;
}

/**
 * NPS = ((promoters - detractors) / total) * 100
 * @param {Array<{ score: number }>} responses
 * @returns {number | null}
 */
export function calculateNps(responses) {
  const valid = filterValidNpsResponses(responses, { skipInvalid: true });
  if (valid.length === 0) return null;

  let promoters = 0;
  let detractors = 0;
  for (const r of valid) {
    const cat = classifyNpsScore(r.score);
    if (cat === 'Promotor') promoters++;
    else if (cat === 'Detrator') detractors++;
  }
  return ((promoters - detractors) / valid.length) * 100;
}

/**
 * @param {Array<{ score: number }>} responses
 * @returns {{
 *   total: number,
 *   promoters: number,
 *   passives: number,
 *   detractors: number,
 *   promoterPct: number,
 *   passivePct: number,
 *   detractorPct: number,
 *   nps: number | null
 * }}
 */
export function calculateNpsSummary(responses) {
  const valid = filterValidNpsResponses(responses, { skipInvalid: true });
  const total = valid.length;
  if (total === 0) {
    return {
      total: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      promoterPct: 0,
      passivePct: 0,
      detractorPct: 0,
      nps: null,
    };
  }

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of valid) {
    const cat = classifyNpsScore(r.score);
    if (cat === 'Promotor') promoters++;
    else if (cat === 'Neutro') passives++;
    else detractors++;
  }

  const pct = (n) => (n / total) * 100;
  return {
    total,
    promoters,
    passives,
    detractors,
    promoterPct: pct(promoters),
    passivePct: pct(passives),
    detractorPct: pct(detractors),
    nps: ((promoters - detractors) / total) * 100,
  };
}
