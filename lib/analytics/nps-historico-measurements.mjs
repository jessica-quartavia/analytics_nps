import {
  calculateNpsSummary,
  dedupeLatestNpsByClient,
  isValidScore,
  npsScoreFromRow,
} from './nps.mjs';
import {
  canonicalizeNpsCycle,
  cycleSortKey,
  quarterStartIso,
} from './nps-cycle-canonical.mjs';
import {
  MEASUREMENTS_FROM_DATE,
  MEASUREMENTS_MIN_SUBMITTED_ISO,
} from './nps-historico-measurements-constants.mjs';

export { MEASUREMENTS_FROM_DATE, MEASUREMENTS_MIN_SUBMITTED_ISO };

export const MEASUREMENT_DEDUPE_RULE =
  'Última resposta válida por client_id dentro de cada medição canônica (BASE QV).';

export const MEASUREMENT_SOURCE = 'processed/responses.json';

function isBaseQvRow(row) {
  const src = String(row?.source ?? 'BASE_QV').toUpperCase();
  return src === 'BASE_QV' || src === 'CURRENT' || !row?.source;
}

function isPharusNpsRow(row) {
  const program = String(row?.program ?? row?.programa ?? 'PHARUS').toUpperCase();
  if (program !== 'PHARUS') return false;
  const form = String(row?.tipo_de_forms ?? 'NPS').toUpperCase();
  return form.startsWith('NPS');
}

function parseSubmittedMs(row) {
  const raw = row?.submitted_at ?? row?.response_date ?? row?.data_resposta;
  if (!raw) return null;
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? null : t;
}

function quarterFromSubmittedAt(isoOrDate) {
  const s = String(isoOrDate ?? '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  if (!y || !month) return null;
  const q = Math.ceil(month / 3);
  return `${y}-Q${q}`;
}

/**
 * Medição canônica (2025-Q1…): ciclo analítico quando existir; senão trimestre de submitted_at.
 * Somente respostas com submitted_at >= 2025-01-01 entram no gráfico histórico.
 */
export function measurementLabelForResponse(row) {
  const fromCode = canonicalizeNpsCycle(row?.analytical_cycle_code ?? row?.cycle_code ?? null);
  if (fromCode && /^\d{4}-Q\d$/.test(fromCode)) {
    const start = quarterStartIso(fromCode);
    if (start && start >= MEASUREMENTS_FROM_DATE) return fromCode;
  }
  const ms = parseSubmittedMs(row);
  const minMs = Date.parse(MEASUREMENTS_MIN_SUBMITTED_ISO);
  if (ms == null || ms < minMs) return null;
  const fromDate = quarterFromSubmittedAt(row.submitted_at ?? row.response_date);
  if (!fromDate || Number(fromDate.slice(0, 4)) < 2025) return null;
  return fromDate;
}

export function enrichMeasurementAuditWithCycles(perCycleAudit, cycles = []) {
  const byCode = new Map((cycles ?? []).map((c) => [c.cycle_code, c]));
  return (perCycleAudit ?? []).map((row) => {
    const def = byCode.get(row.cycle) ?? {};
    return {
      cycle_code: row.cycle,
      label: def.cycle_name ?? def.label ?? row.measurement ?? row.cycle,
      start_at: def.starts_at ?? null,
      end_at: def.ends_at ?? null,
      measurement: row.measurement,
      raw_responses: row.raw_responses,
      valid_responses: row.valid_responses,
      unique_clients: row.distinct_clients,
      promoters: row.promoters,
      neutrals: row.neutrals,
      detractors: row.detractors,
      nps: row.nps ?? null,
    };
  });
}

/**
 * Agrega respostas BASE QV por medição canônica (2025-Q1…).
 * @param {object[]} responses — processed/responses.json
 * @param {object} [opts]
 * @param {Set<string>|null} [opts.clientIds] — universo PHARUS (opcional)
 */
export function buildNpsHistoricoMeasurements(responses, opts = {}) {
  const clientIds = opts.clientIds ?? null;
  let rows = (responses ?? []).filter((r) => isBaseQvRow(r) && isPharusNpsRow(r));
  if (clientIds?.size) {
    rows = rows.filter((r) => r.client_id && clientIds.has(String(r.client_id)));
  }

  const byCanonical = new Map();
  const byCycleCode = new Map();

  for (const row of rows) {
    if (npsScoreFromRow(row) == null) continue;
    const measurement = measurementLabelForResponse(row);
    if (!measurement) continue;

    const cycleKey = row.analytical_cycle_code ?? row.cycle_code ?? measurement;
    if (!byCycleCode.has(cycleKey)) {
      byCycleCode.set(cycleKey, { raw: [], withScore: [] });
    }
    const bucket = byCycleCode.get(cycleKey);
    bucket.raw.push(row);
    bucket.withScore.push(row);

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
        nps: summary?.nps ?? null,
      };
    })
    .sort((a, b) => cycleSortKey(a.cycle) - cycleSortKey(b.cycle));

  const series = [];
  const responseIndex = [];

  for (const [measurement, bucketRows] of [...byCanonical.entries()].sort(
    ([a], [b]) => cycleSortKey(a) - cycleSortKey(b),
  )) {
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
