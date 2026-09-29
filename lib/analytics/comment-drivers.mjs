import { classifyNpsScore, isValidScore } from './nps.mjs';
import { mannWhitneyU, benjaminiHochberg, effectLabel } from './driver-stats.mjs';

function npsFromScores(scores) {
  let p = 0;
  let d = 0;
  let n = 0;
  for (const s of scores) {
    if (!isValidScore(s)) continue;
    n++;
    const c = classifyNpsScore(s);
    if (c === 'Promotor') p++;
    else if (c === 'Detrator') d++;
  }
  if (!n) return null;
  return ((p - d) / n) * 100;
}

function pctDetractors(scores) {
  const valid = scores.filter(isValidScore);
  if (!valid.length) return null;
  return (valid.filter((s) => classifyNpsScore(s) === 'Detrator').length / valid.length) * 100;
}

function pctPromoters(scores) {
  const valid = scores.filter(isValidScore);
  if (!valid.length) return null;
  return (valid.filter((s) => classifyNpsScore(s) === 'Promotor').length / valid.length) * 100;
}

/**
 * @param {Array<object>} responses
 * @param {Array<object>} responseTopics
 * @param {string} cycleCode
 * @param {string} universe
 */
export function buildCommentDrivers(responses, responseTopics, cycleCode, universe = 'cycle') {
  const cycleResponses = responses.filter(
    (r) => r.analytical_cycle_code === cycleCode && isValidScore(r.score),
  );
  let pool = cycleResponses;
  if (universe === 'paired') {
    pool = cycleResponses.filter((r) => r.is_paired_with_previous);
  }

  const byResponse = new Map();
  for (const t of responseTopics.filter((t) => t.analytical_cycle_code === cycleCode)) {
    if (!byResponse.has(t.response_id)) byResponse.set(t.response_id, []);
    byResponse.get(t.response_id).push(t);
  }

  const keys = new Set();
  for (const topics of byResponse.values()) {
    for (const t of topics) keys.add(`${t.topic}\0${t.valence}`);
  }

  const entries = [];
  for (const key of keys) {
    const [topic, valence] = key.split('\0');
    const withIds = new Set();
    for (const [rid, topics] of byResponse) {
      if (topics.some((t) => t.topic === topic && t.valence === valence)) withIds.add(rid);
    }
    const withScores = [];
    const withoutScores = [];
    for (const r of pool) {
      if (withIds.has(r.response_id)) withScores.push(r.score);
      else withoutScores.push(r.score);
    }
    if (withScores.length < 5 || withoutScores.length < 5) continue;

    const mw = mannWhitneyU(withScores, withoutScores);
    entries.push({
      analytical_cycle_code: cycleCode,
      universe,
      topic,
      valence,
      responses_with_topic: withScores.length,
      responses_without_topic: withoutScores.length,
      nps_with: npsFromScores(withScores),
      nps_without: npsFromScores(withoutScores),
      delta_nps:
        npsFromScores(withScores) != null && npsFromScores(withoutScores) != null
          ? npsFromScores(withScores) - npsFromScores(withoutScores)
          : null,
      average_score_with: withScores.reduce((a, b) => a + b, 0) / withScores.length,
      average_score_without: withoutScores.reduce((a, b) => a + b, 0) / withoutScores.length,
      detractor_pct_with: pctDetractors(withScores),
      detractor_pct_without: pctDetractors(withoutScores),
      promoter_pct_with: pctPromoters(withScores),
      promoter_pct_without: pctPromoters(withoutScores),
      method: 'mann_whitney_score',
      p_value_raw: mw.p_value,
      effect_size: mw.effect_size,
      effect_label: effectLabel(mw.effect_size, 'biserial'),
      n: mw.n,
    });
  }

  const fdr = benjaminiHochberg(entries);
  return entries.map((e, i) => ({
    ...e,
    p_value_adjusted: fdr[i].p_value_adjusted,
    significant_fdr_05: fdr[i].significant_fdr_05,
  }));
}
