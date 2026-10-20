import {
  aggregateNpsFromResponses,
  calculateNpsSummary,
  filterOfficialSourceCycleWindowRows,
  isValidScore,
  toCanonicalNpsResult,
} from './nps.mjs';

/** Linha de customer_nps_history / Safras → formato do kernel NPS. */
export function historyRowToNpsResponse(row) {
  if (!row) return null;
  const score = row.nota_nps ?? row.score ?? row.nota;
  if (score == null) return null;
  return {
    client_id: row.client_id,
    score,
    nota: score,
    submitted_at: row.data_resposta ?? row.submitted_at,
    data_resposta: row.data_resposta,
    response_date: row.data_resposta,
    response_id: row.response_id ?? row.source_response_id ?? `${row.client_id}:${row.ciclo ?? ''}`,
    program: row.programa ?? row.program,
    tipo_de_forms: row.tipo_de_forms ?? '',
    ciclo: row.ciclo,
  };
}

/**
 * Agrega NPS de linhas de histórico (BASE QV) com dedupe oficial por client_id.
 * @param {Array<object>} historyRows
 * @param {{ clientIds?: Set<string>|null, officialBounds?: { starts_at?: string, ends_at?: string }|null }} [opts]
 */
export function aggregateNpsFromHistoryRows(historyRows, opts = {}) {
  const { clientIds = null, officialBounds = null } = opts;
  let pool = (historyRows ?? []).map(historyRowToNpsResponse).filter(Boolean);
  if (clientIds?.size) {
    pool = pool.filter((r) => clientIds.has(String(r.client_id)));
  }
  if (officialBounds) {
    pool = filterOfficialSourceCycleWindowRows(pool, officialBounds);
  }
  const agg = aggregateNpsFromResponses(pool, { dedupe: true, requireClientId: true });
  return { ...agg, ...toCanonicalNpsResult(agg) };
}

/**
 * NPS por safra (entry_cohort) — kernel canônico.
 * Preferir `responses` (+ optional `officialBounds`) sobre `nps_score` PIT do cliente.
 * @param {Array<{ client_id?: string, entry_cohort?: string|null, nps_score?: number|null, score?: number|null }>} clients
 * @param {{ minYear?: number|null, responses?: Array<object>|null, officialBounds?: object|null }} [opts]
 */
export function buildNpsByEntryCohort(clients, opts = {}) {
  const minYear = opts.minYear ?? null;
  const responses = opts.responses ?? null;
  const officialBounds = opts.officialBounds ?? null;
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
    const clientIds = new Set(bucket.map((c) => String(c.client_id)).filter(Boolean));
    let summary = null;
    let n = 0;
    let average_score = null;

    if (responses?.length && clientIds.size) {
      const agg = aggregateNpsFromHistoryRows(responses, { clientIds, officialBounds });
      summary = {
        promoters: agg.promoters,
        passives: agg.neutrals,
        detractors: agg.detractors,
        nps: agg.nps,
        total: agg.responses,
      };
      n = agg.responses;
      average_score =
        agg.average_score != null ? Math.round(Number(agg.average_score) * 10) / 10 : null;
    } else {
      const scores = bucket
        .map((c) => c.nps_score ?? c.score)
        .filter((s) => s != null && isValidScore(Number(s)));
      n = scores.length;
      summary = scores.length
        ? calculateNpsSummary(scores.map((score) => ({ score: Number(score) })))
        : null;
      average_score = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null;
    }

    rows.push({
      safra,
      entry_cohort: safra,
      clients: bucket.length,
      n,
      nps_responses: n,
      promoters: summary?.promoters ?? 0,
      neutrals: summary?.passives ?? 0,
      detractors: summary?.detractors ?? 0,
      nps: summary?.nps ?? null,
      average_score,
    });
  }

  rows.sort((a, b) => String(a.safra).localeCompare(String(b.safra)));
  return rows;
}

/** Alias canônico — NPS por safra (entry_cohort / data_entrada BASE0). */
export const buildNpsByCohort = buildNpsByEntryCohort;
