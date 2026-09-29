import { PRIORITY_RANK } from './action-config.mjs';

const NEGATIVE_MIGRATIONS = new Set([
  'Promotor → Detrator',
  'Promotor → Neutro',
  'Neutro → Detrator',
]);

/**
 * Promotor estável: mesma categoria e sem queda material de nota.
 */
export function isStablePromoterPair(row) {
  return (
    row.nps_category === 'Promotor' &&
    row.previous_category === 'Promotor' &&
    (row.score_delta ?? 0) >= -1
  );
}

/**
 * Sinal qualitativo: nota ainda promotora, sem deterioração material, com ressalva no comentário.
 */
export function computeQualitativeSignal(row, ctx = {}) {
  const negTopics = ctx.negative_topics_count ?? 0;
  if (!isStablePromoterPair(row) || negTopics < 1) {
    return { qualitative_signal: false, messages: [] };
  }
  return {
    qualitative_signal: true,
    messages: [
      'Há ressalva no comentário (tema negativo) com nota promotora e evolução estável.',
    ],
  };
}

function hasCsatNpsContradiction(row, ctx) {
  const category = row.nps_category;
  const delta = row.score_delta ?? null;
  const hasCsat = ctx.has_csat === true;
  const latestCsat = ctx.latest_csat_score;
  const csatAvg = ctx.csat_average;

  if (hasCsat && latestCsat != null && latestCsat >= 4 && category === 'Detrator') {
    return true;
  }
  if (
    hasCsat &&
    csatAvg != null &&
    csatAvg >= 4 &&
    delta != null &&
    delta <= -2 &&
    category !== 'Detrator'
  ) {
    return true;
  }
  return false;
}

/**
 * Investigar por ≥2 temas negativos entre Promotores exige sinal adicional.
 */
export function promoterNegativeTopicsNeedsAdditionalSignal(row, ctx = {}) {
  const delta = row.score_delta ?? null;
  const migration = row.nps_migration || '';
  const currentScore = row.current_score ?? row.score ?? null;
  const topics = ctx.topics ?? [];

  if (delta != null && delta <= -2) return true;
  if (NEGATIVE_MIGRATIONS.has(migration)) return true;
  if (currentScore != null && currentScore <= 8) return true;
  if (hasCsatNpsContradiction(row, ctx)) return true;
  if (topics.some((t) => t.valence === 'Negativa' && t.reviewed === true)) return true;
  return false;
}

/**
 * @param {object} row resposta com campos derivados
 * @param {object} [ctx] temas, CSAT, comentário
 * @returns {{
 *   priority: string|null,
 *   reasons: string[],
 *   priority_reasons: string[],
 *   other_signals: string[],
 *   qualitative_signal: boolean,
 * }}
 */
export function computeActionPriority(row, ctx = {}) {
  /** @type {Array<{ p: string, reason: string }>} */
  const reasonEntries = [];
  let priority = null;

  const migration = row.nps_migration || '';
  const evolution = row.evolution_status || '';
  const category = row.nps_category;
  const prevCat = row.previous_category;

  const add = (p, reason) => {
    reasonEntries.push({ p, reason });
    if (!priority || PRIORITY_RANK[p] > PRIORITY_RANK[priority]) {
      priority = p;
    }
  };

  if (migration === 'Promotor → Detrator') {
    add('Alta', 'Promotor → Detrator');
  }
  if (evolution === 'Queda severa') {
    add('Alta', 'Queda severa');
  }
  if (row.consecutive_detractor) {
    add('Alta', 'Detrator recorrente (ciclos consecutivos)');
  }
  if (row.critical_flag && !reasonEntries.some((r) => r.reason.includes('Promotor') || r.reason.includes('Queda severa'))) {
    add('Alta', 'Sinal crítico de experiência');
  }

  if (migration === 'Promotor → Neutro') {
    add('Média', 'Promotor → Neutro');
  }
  if (migration === 'Neutro → Detrator') {
    add('Média', 'Neutro → Detrator');
  }
  if (evolution === 'Queda' && prevCat === category && category !== 'Detrator') {
    add('Média', 'Queda relevante sem mudança de categoria');
  }

  if (migration === 'Detrator → Promotor') {
    add('Aprendizado', 'Detrator → Promotor');
  }
  if (evolution === 'Grande melhora') {
    add('Aprendizado', 'Grande melhora');
  }
  if (row.promotor_consistent) {
    add('Aprendizado', 'Promotor consistente em múltiplos ciclos');
  }

  for (const inv of computeInvestigateReasons(row, ctx)) {
    add('Investigar', inv);
  }

  const { qualitative_signal, messages } = computeQualitativeSignal(row, ctx);
  const other_signals = qualitative_signal ? [...messages] : [];

  if (!priority) {
    return {
      priority: null,
      reasons: [],
      priority_reasons: [],
      other_signals,
      qualitative_signal,
    };
  }

  const priority_reasons = reasonEntries.filter((e) => e.p === priority).map((e) => e.reason);
  const reasons = reasonEntries.map((e) => e.reason);

  return {
    priority,
    reasons,
    priority_reasons,
    other_signals,
    qualitative_signal,
  };
}

/**
 * Sinais para prioridade Investigar (não causal).
 * @param {object} row
 * @param {object} ctx
 * @returns {string[]}
 */
export function computeInvestigateReasons(row, ctx = {}) {
  const reasons = [];
  const category = row.nps_category;
  const delta = row.score_delta ?? null;
  const hasCsat = ctx.has_csat === true;
  const latestCsat = ctx.latest_csat_score;
  const csatAvg = ctx.csat_average;
  const negTopics = ctx.negative_topics_count ?? 0;
  const topicsCount = ctx.topics_count ?? 0;
  const comment = (row.comment ?? ctx.comment ?? '').trim();

  if (hasCsat && latestCsat != null && latestCsat >= 4 && category === 'Detrator') {
    reasons.push('CSAT recente favorável com NPS Detrator (sinal contraditório)');
  }
  if (
    hasCsat &&
    csatAvg != null &&
    csatAvg >= 4 &&
    delta != null &&
    delta <= -2 &&
    category !== 'Detrator'
  ) {
    reasons.push('Queda de NPS com CSAT médio elevado (sinal contraditório)');
  }
  if (negTopics >= 2 && category === 'Promotor') {
    if (promoterNegativeTopicsNeedsAdditionalSignal(row, ctx)) {
      reasons.push('Comentário com múltiplos temas negativos entre Promotores');
    }
  }
  if (
    delta != null &&
    Math.abs(delta) >= 4 &&
    !comment &&
    topicsCount === 0 &&
    row.is_paired_with_previous
  ) {
    reasons.push('Mudança relevante de nota sem comentário ou temas classificados');
  }
  if (
    category === 'Detrator' &&
    (row.evolution_status === 'Melhora' || row.evolution_status === 'Grande melhora')
  ) {
    reasons.push('Categoria Detrator com evolução classificada como melhora');
  }

  return reasons;
}

export function mergePriorityResults(results) {
  let best = null;
  const allReasons = [];
  for (const r of results) {
    if (!r.priority) continue;
    if (!best || PRIORITY_RANK[r.priority] > PRIORITY_RANK[best]) {
      best = r.priority;
    }
    allReasons.push(...r.reasons);
  }
  return { priority: best, reason: [...new Set(allReasons)].join('; ') };
}

export function sortByPriority(a, b) {
  const ra = PRIORITY_RANK[a.priority] ?? 0;
  const rb = PRIORITY_RANK[b.priority] ?? 0;
  if (rb !== ra) return rb - ra;
  if (Boolean(b.critical_flag) !== Boolean(a.critical_flag)) {
    return (b.critical_flag ? 1 : 0) - (a.critical_flag ? 1 : 0);
  }
  const da = a.score_delta ?? 0;
  const db = b.score_delta ?? 0;
  return da - db;
}
