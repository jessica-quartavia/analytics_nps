import { TOPIC_EVOLUTION_THRESHOLDS } from './voc-config.mjs';

/**
 * Sinais analíticos de evolução (regras explícitas — ver voc-config TOPIC_EVOLUTION_THRESHOLDS).
 * @typedef {'positive_emerging' | 'pain_emerging' | 'recurring_pain' | 'improving' | 'stable'} EvolutionSignal
 */

/**
 * @param {object} current — linha topic_summary do ciclo atual
 * @param {object | null} previous — mesma topic no ciclo anterior
 * @returns {EvolutionSignal | null}
 */
export function classifyTopicEvolution(current, previous) {
  const t = TOPIC_EVOLUTION_THRESHOLDS;
  if (!current || current.responses_with_topic <= 0) return null;

  const pctNow = current.pct_responses ?? 0;
  const pctPrev = previous?.pct_responses ?? 0;
  const pctDelta = pctNow - pctPrev;

  const negShare =
    current.mentions > 0 ? (current.negative ?? 0) / current.mentions : 0;
  const negSharePrev =
    previous && previous.mentions > 0 ? (previous.negative ?? 0) / previous.mentions : 0;

  const posShare =
    current.mentions > 0 ? (current.positive ?? 0) / current.mentions : 0;
  const posSharePrev =
    previous && previous.mentions > 0 ? (previous.positive ?? 0) / previous.mentions : 0;

  const negativePctNow = current.negative_pct ?? 0;
  const negativePctPrev = previous?.negative_pct ?? 0;

  if (
    negShare >= t.negativeShareMin &&
    pctDelta >= t.pctResponsesDeltaMin &&
    pctNow >= t.recurringMinPct
  ) {
    return 'pain_emerging';
  }

  if (
    negShare >= t.negativeShareMin &&
    (previous?.responses_with_topic ?? 0) > 0 &&
    pctPrev >= t.recurringMinPct &&
    pctNow >= t.recurringMinPct
  ) {
    return 'recurring_pain';
  }

  if (
    posShare >= t.positiveShareMin &&
    pctDelta >= t.pctResponsesDeltaMin &&
    posShare > posSharePrev
  ) {
    return 'positive_emerging';
  }

  if (
    previous &&
    (negShare <= t.negativeShareImproveMax || negativePctNow + 5 <= negativePctPrev) &&
    (pctDelta <= -t.pctResponsesDeltaMin || negShare + 0.1 <= negSharePrev)
  ) {
    return 'improving';
  }

  if (previous && Math.abs(pctDelta) < t.pctResponsesDeltaMin) {
    return 'stable';
  }

  return null;
}

/**
 * Agrupa entradas por ciclo em buckets de evolução para UI.
 * @param {Array<object>} entries — topic_summary entries (vários ciclos)
 * @param {string} currentCycleCode
 */
export function buildEvolutionBuckets(entries, currentCycleCode, sortedCycleCodes = []) {
  const byCycleTopic = new Map();
  for (const e of entries) {
    byCycleTopic.set(`${e.analytical_cycle_code}\0${e.topic}`, e);
  }

  const codes =
    sortedCycleCodes.length > 0
      ? sortedCycleCodes
      : [...new Set(entries.map((e) => e.analytical_cycle_code))];
  const idx = codes.indexOf(currentCycleCode);
  const prevCode = idx > 0 ? codes[idx - 1] : null;
  const buckets = {
    pain_emerging: [],
    recurring_pain: [],
    improving: [],
    positive_emerging: [],
    stable: [],
  };

  const currentTopics = entries.filter((e) => e.analytical_cycle_code === currentCycleCode);
  for (const cur of currentTopics) {
    const prev = prevCode
      ? byCycleTopic.get(`${prevCode}\0${cur.topic}`) ?? null
      : null;
    const signal = classifyTopicEvolution(cur, prev);
    if (!signal) continue;
    const item = {
      topic: cur.topic,
      pct_previous: prev?.pct_responses ?? null,
      pct_current: cur.pct_responses,
      mention_pct_delta: cur.mention_pct_delta,
      predominant_valence: predominantValence(cur),
    };
    buckets[signal].push(item);
  }

  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => (b.pct_current ?? 0) - (a.pct_current ?? 0));
  }

  return buckets;
}

function predominantValence(row) {
  const counts = [
    ['Positiva', row.positive ?? 0],
    ['Neutra', row.neutral ?? 0],
    ['Negativa', row.negative ?? 0],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : 'Neutra';
}
