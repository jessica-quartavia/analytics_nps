import {
  resolveCycleBounds,
  matchesAnalyticalCycle,
  dedupeByClientAndAnalyticalCycle,
} from './analytical-cycles-runtime.mjs';
import {
  aggregateNpsForOfficialSourceCycleWindow,
  aggregateNpsFromResponses,
  dedupeLatestNpsByClient,
  filterOfficialSourceCycleWindowRows,
  npsScoreFromRow,
} from './nps.mjs';
import { canonicalizeNpsCycle, cycleSortKey } from './nps-cycle-canonical.mjs';

export const NPS_MEASUREMENTS_BASEQV_SOURCE = 'BASE_QV:nps_responses+nps_cycles';

const MEASUREMENTS_FROM_MS = Date.parse('2025-01-01T00:00:00.000Z');

function cycleStartsOnOrAfter2025(bounds) {
  const start = bounds?.starts_at;
  if (!start) return true;
  const ms = Date.parse(start);
  return !Number.isNaN(ms) && ms >= MEASUREMENTS_FROM_MS;
}

function normalizeResponseRow(row) {
  const score = row.score ?? row.nota_nps ?? npsScoreFromRow(row);
  return {
    ...row,
    score,
    client_id: row.client_id ? String(row.client_id) : null,
    submitted_at: row.submitted_at ?? row.response_date ?? null,
    tipo_de_forms: row.tipo_de_forms ?? 'NPS',
    response_id: row.response_id ?? row.id ?? null,
  };
}

/**
 * Série oficial "Respostas por medição" — somente BASE QV.
 * Ciclo corrente (source_cycle): aggregateNpsForOfficialSourceCycleWindow (kernel Executivo).
 * Reconstrução histórica: PHARUS + janela + dedupe por client_id dentro do ciclo analítico.
 */
export function buildNpsMeasurementsBaseQv({
  responses = [],
  sourceCycles = [],
  clientsMap = new Map(),
  analyticalConfig = [],
  clientIdsFilter = null,
}) {
  const ids =
    clientIdsFilter instanceof Set
      ? clientIdsFilter
      : clientIdsFilter?.length
        ? new Set(clientIdsFilter)
        : null;

  let rows = (responses ?? []).map(normalizeResponseRow).filter((r) => r.client_id);
  if (ids?.size) {
    rows = rows.filter((r) => ids.has(r.client_id));
  }

  const config = [...(analyticalConfig ?? [])].sort(
    (a, b) => (a.sequence ?? 999) - (b.sequence ?? 999),
  );

  const measurements = [];
  const responseIndex = [];

  for (const def of config) {
    const bounds = resolveCycleBounds(def, sourceCycles);
    if (!cycleStartsOnOrAfter2025(bounds)) continue;

    const label = canonicalizeNpsCycle(def.cycle_code);
    if (!label || !/^\d{4}-Q\d$/.test(label)) continue;

    if (def.type === 'source_cycle') {
      const windowRows = rows.map((r) => ({
        ...r,
        program: clientsMap.get(r.client_id)?.programa ?? r.program ?? 'PHARUS',
      }));
      const rawInWindow = filterOfficialSourceCycleWindowRows(windowRows, bounds);
      const deduped = dedupeLatestNpsByClient(rawInWindow, { requireClientId: true });
      const agg = aggregateNpsForOfficialSourceCycleWindow(windowRows, bounds);

      for (const r of deduped) {
        const score = npsScoreFromRow(r);
        if (score == null) continue;
        responseIndex.push({
          response_id: r.response_id,
          client_id: r.client_id,
          cycle_code: def.cycle_code,
          measurement: label,
          score,
          submitted_at: r.submitted_at,
          aggregation: 'official_source_window',
        });
      }

      measurements.push({
        cycle_code: def.cycle_code,
        label,
        start_at: bounds.starts_at ?? null,
        end_at: bounds.ends_at ?? null,
        cycle_type: def.type,
        aggregation: 'official_source_window',
        raw_responses: rawInWindow.length,
        valid_responses: agg.responses,
        unique_clients: agg.responses,
        deduped_responses: agg.responses,
        promoters: agg.promoters,
        neutrals: agg.neutrals,
        detractors: agg.detractors,
        nps: agg.nps,
        average_score: agg.average_score ?? null,
      });
      continue;
    }

    const matched = [];
    for (const r of rows) {
      const client = clientsMap.get(r.client_id) ?? null;
      if (!matchesAnalyticalCycle(r, client, def, sourceCycles)) continue;
      matched.push({ ...r, analytical_cycle_code: def.cycle_code });
    }
    const { kept } = dedupeByClientAndAnalyticalCycle(matched);
    const agg = aggregateNpsFromResponses(
      kept.map((r) => ({ score: npsScoreFromRow(r) })),
      { dedupe: false },
    );

    for (const r of kept) {
      const score = npsScoreFromRow(r);
      if (score == null) continue;
      responseIndex.push({
        response_id: r.response_id,
        client_id: r.client_id,
        cycle_code: def.cycle_code,
        measurement: label,
        score,
        submitted_at: r.submitted_at,
        aggregation: 'analytical_cycle_pharus',
      });
    }

    measurements.push({
      cycle_code: def.cycle_code,
      label,
      start_at: bounds.starts_at ?? null,
      end_at: bounds.ends_at ?? null,
      cycle_type: def.type,
      aggregation: 'analytical_cycle_pharus',
      raw_responses: matched.length,
      valid_responses: kept.length,
      unique_clients: new Set(kept.map((r) => r.client_id)).size,
      deduped_responses: kept.length,
      promoters: agg.promoters,
      neutrals: agg.neutrals,
      detractors: agg.detractors,
      nps: agg.nps,
      average_score: agg.average_score ?? null,
    });
  }

  measurements.sort((a, b) => cycleSortKey(a.label) - cycleSortKey(b.label));

  return {
    source: NPS_MEASUREMENTS_BASEQV_SOURCE,
    dedupe_rule:
      'Por ciclo analítico: source_cycle = janela oficial Executivo (dedupe por client_id); reconstruction = PHARUS + dedupe por client_id no ciclo.',
    measurements,
    response_index: responseIndex,
  };
}

/** Recalcula série a partir do índice materializado (filtro safra explícito). */
export function aggregateMeasurementsFromBaseQvIndex(responseIndex, filteredClientIds) {
  const ids =
    filteredClientIds == null
      ? null
      : filteredClientIds instanceof Set
        ? filteredClientIds
        : new Set(filteredClientIds ?? []);
  let rows = responseIndex ?? [];
  if (ids?.size) {
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
    const scores = bucket.map((r) => r.score).filter((s) => s != null);
    const agg = aggregateNpsFromResponses(scores.map((score) => ({ score })), { dedupe: false });
    series.push({
      measurement,
      valid_responses: agg.responses,
      distinct_clients: new Set(bucket.map((r) => r.client_id)).size,
      promoters: agg.promoters,
      neutrals: agg.neutrals,
      detractors: agg.detractors,
      nps: agg.nps,
    });
  }
  return series;
}
