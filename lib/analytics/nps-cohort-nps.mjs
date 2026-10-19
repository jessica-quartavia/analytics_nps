import { calculateNpsSummary, isValidScore } from './nps.mjs';

/**
 * NPS por safra (entry_cohort) — helper canônico.
 * @param {Array<{ entry_cohort?: string|null, nps_score?: number|null, score?: number|null }>} clients
 * @param {{ minYear?: number|null }} [opts]
 */
export function buildNpsByEntryCohort(clients, opts = {}) {
  const minYear = opts.minYear ?? null;
  const bySafra = new Map();

  for (const c of clients ?? []) {
    const safra = c.entry_cohort;
    if (!safra) continue;
    if (minYear != null) {
      const y = Number(String(safra).slice(0, 4));
      if (!Number.isFinite(y) || y < minYear) continue;
    }
    if (!bySafra.has(safra)) bySafra.set(safra, []);
    bySafra.get(safra).push(c);
  }

  const rows = [];
  for (const [safra, bucket] of bySafra.entries()) {
    const scores = bucket
      .map((c) => c.nps_score ?? c.score)
      .filter((s) => s != null && isValidScore(Number(s)));
    const summary = scores.length
      ? calculateNpsSummary(scores.map((score) => ({ score: Number(score) })))
      : null;
    rows.push({
      safra,
      entry_cohort: safra,
      clients: bucket.length,
      n: scores.length,
      nps_responses: scores.length,
      promoters: summary?.promoters ?? 0,
      neutrals: summary?.passives ?? 0,
      detractors: summary?.detractors ?? 0,
      nps: summary?.nps ?? null,
      average_score: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
    });
  }

  rows.sort((a, b) => String(a.safra).localeCompare(String(b.safra)));
  return rows;
}

/** Alias canônico — NPS por safra (entry_cohort / data_entrada BASE0). */
export const buildNpsByCohort = buildNpsByEntryCohort;
