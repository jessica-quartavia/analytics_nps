import {
  calculateNpsSummary,
  dedupeLatestNpsByClient,
  isValidScore,
  npsScoreFromRow,
} from './nps.mjs';
import { canonicalizeNpsCycle, cycleSortKey } from './nps-cycle-canonical.mjs';

export const MEASUREMENT_DEDUPE_RULE =
  'Última resposta válida por client_id dentro de cada medição canônica (BASE QV).';

export const MEASUREMENT_SOURCE = 'processed/responses.json';

function isBaseQvRow(row) {
  const src = String(row?.source ?? 'BASE_QV').toUpperCase();
  return src === 'BASE_QV' || src === 'CURRENT' || !row?.source;
}

function measurementYear(label) {
  const m = String(label ?? '').match(/^(\d{4})-Q\d$/);
  return m ? Number(m[1]) : null;
}

/**
 * Agrega respostas BASE QV por medição canônica (2025-Q1…).
 * @param {object[]} responses — processed/responses.json
 * @param {object} [opts]
 * @param {Set<string>|null} [opts.clientIds] — universo PHARUS (opcional)
 */
export function buildNpsHistoricoMeasurements(responses, opts = {}) {
  const clientIds = opts.clientIds ?? null;
  let rows = (responses ?? []).filter(isBaseQvRow);
  if (clientIds?.size) {
    rows = rows.filter((r) => r.client_id && clientIds.has(String(r.client_id)));
  }

  const byCanonical = new Map();
  const byCycleCode = new Map();

  for (const row of rows) {
    const cycleCode = row.analytical_cycle_code ?? row.cycle_code ?? null;
    if (!cycleCode) continue;
    if (!byCycleCode.has(cycleCode)) {
      byCycleCode.set(cycleCode, { raw: [], withScore: [] });
    }
    const bucket = byCycleCode.get(cycleCode);
    bucket.raw.push(row);
    if (npsScoreFromRow(row) != null) bucket.withScore.push(row);

    const measurement = canonicalizeNpsCycle(cycleCode);
    if (!measurement || !/^\d{4}-Q\d$/.test(measurement)) continue;
    if (!byCanonical.has(measurement)) byCanonical.set(measurement, []);
    byCanonical.get(measurement).push(row);
  }

  const perCycleAudit = [...byCycleCode.entries()]
    .map(([cycle, b]) => {
      const deduped = dedupeLatestNpsByClient(b.withScore, { requireClientId: true });
      const scores = deduped.map((r) => npsScoreFromRow(r)).filter((s) => s != null);
      const summary = scores.length ? calculateNpsSummary(scores.map((score) => ({ score }))) : null;
      return {
        cycle,
        measurement: canonicalizeNpsCycle(cycle),
        raw_responses: b.raw.length,
        valid_responses: scores.length,
        distinct_clients: new Set(deduped.map((r) => r.client_id).filter(Boolean)).size,
        deduped_responses: deduped.length,
        promoters: summary?.promoters ?? 0,
        neutrals: summary?.passives ?? 0,
        detractors: summary?.detractors ?? 0,
      };
    })
    .sort((a, b) => cycleSortKey(a.cycle) - cycleSortKey(b.cycle));

  const series = [];
  const responseIndex = [];

  for (const [measurement, bucketRows] of [...byCanonical.entries()].sort(
    ([a], [b]) => cycleSortKey(a) - cycleSortKey(b),
  )) {
    const year = measurementYear(measurement);
    if (year != null && year < 2025) continue;

    const withScore = bucketRows.filter((r) => npsScoreFromRow(r) != null);
    const deduped = dedupeLatestNpsByClient(withScore, { requireClientId: true });
    const scores = deduped.map((r) => npsScoreFromRow(r)).filter((s) => isValidScore(s));
    const summary = scores.length ? calculateNpsSummary(scores.map((score) => ({ score }))) : null;

    for (const r of deduped) {
      const score = npsScoreFromRow(r);
      if (score == null) continue;
      responseIndex.push({
        response_id: r.response_id ?? null,
        client_id: String(r.client_id),
        measurement,
        analytical_cycle_code: r.analytical_cycle_code ?? null,
        score,
        nps_category: r.nps_category ?? null,
        submitted_at: r.submitted_at ?? r.response_date ?? null,
      });
    }

    series.push({
      measurement,
      raw_responses: bucketRows.length,
      valid_responses: scores.length,
      distinct_clients: new Set(deduped.map((r) => r.client_id).filter(Boolean)).size,
      deduped_responses: deduped.length,
      promoters: summary?.promoters ?? 0,
      neutrals: summary?.passives ?? 0,
      detractors: summary?.detractors ?? 0,
      nps: summary?.nps ?? null,
    });
  }

  return {
    dedupe_rule: MEASUREMENT_DEDUPE_RULE,
    source: MEASUREMENT_SOURCE,
    per_cycle_audit: perCycleAudit,
    series,
    response_index: responseIndex,
  };
}

/** Recalcula série a partir do índice materializado (já deduplicado) + recorte de clientes. */
export function aggregateMeasurementsFromIndex(responseIndex, filteredClientIds) {
  const ids = filteredClientIds instanceof Set ? filteredClientIds : new Set(filteredClientIds ?? []);
  let rows = responseIndex ?? [];
  if (ids.size) {
    rows = rows.filter((r) => ids.has(r.client_id));
  }

  const byMeasurement = new Map();
  for (const r of rows) {
    if (!byMeasurement.has(r.measurement)) byMeasurement.set(r.measurement, []);
    byMeasurement.get(r.measurement).push(r);
  }

  const series = [];
  for (const [measurement, bucket] of [...byMeasurement.entries()].sort(
    ([a], [b]) => cycleSortKey(a) - cycleSortKey(b),
  )) {
    if (measurementYear(measurement) != null && measurementYear(measurement) < 2025) continue;
    const scores = bucket.map((r) => r.score).filter((s) => isValidScore(s));
    const summary = scores.length ? calculateNpsSummary(scores.map((score) => ({ score }))) : null;
    series.push({
      measurement,
      valid_responses: scores.length,
      distinct_clients: new Set(bucket.map((r) => r.client_id)).size,
      promoters: summary?.promoters ?? 0,
      neutrals: summary?.passives ?? 0,
      detractors: summary?.detractors ?? 0,
      nps: summary?.nps ?? null,
    });
  }
  return series;
}
