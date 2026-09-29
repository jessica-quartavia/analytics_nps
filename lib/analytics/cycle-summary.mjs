import { calculateNpsSummary, classifyNpsScore, isValidScore } from './nps.mjs';
import { calculateNpsConfidenceInterval } from './nps-confidence.mjs';

/** Baseline aprovado ETAPA 2.3 — Jun–Jul/2026 PHARUS pós-dedupe. */
export const JUN_JUL_2026_BASELINE = {
  cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
  valid_responses: 255,
  promoters: 199,
  passives: 31,
  detractors: 25,
  nps: 68.23529411764706,
  historical_expected: 262,
  historical_gap: 7,
};

/**
 * @param {Array<{ score: number }>} responses
 */
export function buildScoreDistribution(responses) {
  const dist = Object.fromEntries([...Array(11).keys()].map((k) => [String(k), 0]));
  for (const r of responses) {
    if (!isValidScore(r.score)) continue;
    dist[String(r.score)]++;
  }
  return dist;
}

function median(scores) {
  if (!scores.length) return null;
  const s = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function average(scores) {
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * @param {object} cycleDef config entry
 * @param {Array<object>} cycleResponses
 * @param {{ dataCutoff: string, eligibleMeta?: object }} ctx
 */
export function buildCycleSummaryEntry(cycleDef, cycleResponses, ctx) {
  const valid = cycleResponses.filter((r) => isValidScore(r.score));
  const scores = valid.map((r) => r.score);
  const summary = calculateNpsSummary(valid);
  const score_distribution = buildScoreDistribution(valid);
  const ci = calculateNpsConfidenceInterval(scores);

  const evolution_distribution = {
    great_improvement: 0,
    improvement: 0,
    stable: 0,
    decline: 0,
    severe_decline: 0,
  };
  for (const r of valid) {
    if (!r.evolution_status) continue;
    if (r.evolution_status === 'Grande melhora') evolution_distribution.great_improvement++;
    else if (r.evolution_status === 'Melhora') evolution_distribution.improvement++;
    else if (r.evolution_status === 'Estável') evolution_distribution.stable++;
    else if (r.evolution_status === 'Queda') evolution_distribution.decline++;
    else if (r.evolution_status === 'Queda severa') evolution_distribution.severe_decline++;
  }

  const status =
    cycleDef.type === 'historical_reconstruction'
      ? cycleDef.reconstruction_status ?? 'partial'
      : cycleDef.cycle_status ?? 'open';

  return {
    cycle_code: cycleDef.cycle_code,
    cycle_name: cycleDef.cycle_name,
    program: cycleDef.program,
    sequence: cycleDef.sequence ?? null,
    status,
    data_cutoff: ctx.dataCutoff,
    valid_responses: summary.total,
    promoters: summary.promoters,
    passives: summary.passives,
    detractors: summary.detractors,
    promoter_pct: summary.promoterPct,
    passive_pct: summary.passivePct,
    detractor_pct: summary.detractorPct,
    nps: summary.nps,
    average_score: average(scores),
    median_score: median(scores),
    ...ci,
    score_distribution,
    evolution_distribution,
    eligible_clients: ctx.eligibleMeta?.eligible_clients ?? null,
    response_rate: ctx.eligibleMeta?.response_rate ?? null,
    response_rate_quality: ctx.eligibleMeta?.response_rate_quality ?? 'unavailable',
    reconstruction_status: cycleDef.reconstruction_status ?? null,
    historical_expected: cycleDef.historical_expected_responses ?? null,
    historical_gap:
      cycleDef.historical_expected_responses != null
        ? cycleDef.historical_expected_responses - summary.total
        : null,
  };
}

/**
 * @param {object} junJulSummary from buildCycleSummaryEntry
 * @returns {{ ok: boolean, failures: object[] }}
 */
export function verifyJunJulBaseline(junJulSummary) {
  const b = JUN_JUL_2026_BASELINE;
  const failures = [];
  const checks = [
    ['valid_responses', junJulSummary.valid_responses, b.valid_responses],
    ['promoters', junJulSummary.promoters, b.promoters],
    ['passives', junJulSummary.passives, b.passives],
    ['detractors', junJulSummary.detractors, b.detractors],
    ['nps', junJulSummary.nps, b.nps],
  ];
  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      failures.push({ field, expected, actual, delta: actual - expected });
    }
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Invariantes pós-processamento (A–D).
 * @param {Array<object>} responses processed
 * @param {Array<object>} cycleSummaries
 * @param {object|null} migrationMatrix
 * @param {object|null} pairedCycles
 */
export function validateRefreshInvariants(responses, cycleSummaries, migrationMatrix, pairedCycles) {
  const errors = [];

  for (const summary of cycleSummaries) {
    const sumCat = summary.promoters + summary.passives + summary.detractors;
    if (sumCat !== summary.valid_responses) {
      errors.push({
        code: 'A',
        message: `P+N+D (${sumCat}) != valid_responses (${summary.valid_responses}) em ${summary.cycle_code}`,
      });
    }
    const distSum = Object.values(summary.score_distribution).reduce((a, b) => a + b, 0);
    if (distSum !== summary.valid_responses) {
      errors.push({
        code: 'B',
        message: `score_distribution sum (${distSum}) != valid_responses (${summary.valid_responses}) em ${summary.cycle_code}`,
      });
    }
  }

  const keys = new Set();
  for (const r of responses) {
    if (!r.client_id || !r.analytical_cycle_code) continue;
    const k = `${r.client_id}::${r.analytical_cycle_code}`;
    if (keys.has(k)) {
      errors.push({ code: 'C', message: `Duplicata client+ciclo: ${k}` });
    }
    keys.add(k);
    if (r.nps_category !== classifyNpsScore(r.score)) {
      errors.push({ code: 'category', message: `Categoria inconsistente ${r.response_id}` });
    }
  }

  if (migrationMatrix) {
    const cellSum = migrationMatrix.cells.reduce((a, c) => a + c.count, 0);
    if (cellSum !== migrationMatrix.paired_clients) {
      errors.push({
        code: 'D',
        message: `migration counts (${cellSum}) != paired_clients (${migrationMatrix.paired_clients})`,
      });
    }
  }

  if (pairedCycles && migrationMatrix) {
    if (pairedCycles.paired_clients !== migrationMatrix.paired_clients) {
      errors.push({
        code: 'paired_migration',
        message: 'paired_clients diverge entre paired_cycles e migration_matrix',
      });
    }
  }

  return errors;
}
