import { cycleSortKey } from '../../../lib/analytics/nps-cycle-canonical.mjs';
import { aggregateMeasurementsFromConsolidatedIndex } from '../../../lib/analytics/nps-measurements-consolidated.mjs';
import { aggregateMeasurementsFromBaseQvIndex } from '../../../lib/analytics/nps-measurements-baseqv.mjs';
import {
  buildCanonicalCurrentCycleNpsPoint,
  isAuditFullT3MeasurementRow,
} from './canonical-current-cycle-nps.mjs';
import { canonicalizeNpsCycle } from '../utils/nps-cycle-labels.mjs';
import {
  hasExplicitHistorico2Filters,
  clientDisplayName,
  ENTRY_YEAR_ALL,
} from './historico2-view.mjs';

/**
 * Gráfico “Respostas por medição” — fonte:
 * `processed/nps_measurements_consolidated.json`
 * (histórico oficial nps_historico + ciclo atual BASE QV).
 */

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function sourceCyclesFromStore(cycles) {
  const out = [];
  for (const c of cycles ?? []) {
    const names = c.source_cycle_names ?? [];
    const ids = c.source_cycle_ids ?? [];
    for (let i = 0; i < names.length; i += 1) {
      out.push({
        id: ids[i] ?? null,
        name: names[i],
        starts_at: c.starts_at ?? null,
        ends_at: c.ends_at ?? null,
      });
    }
  }
  return out;
}

function clientsMapFromHistorico2(doc) {
  const map = new Map();
  for (const c of doc?.clients ?? []) {
    if (!c.client_id) continue;
    map.set(c.client_id, { programa: c.programa ?? c.program ?? 'PHARUS' });
  }
  return map;
}

function clientNameKeysForHistoricoFilter(filteredClients) {
  const keys = new Set();
  for (const c of filteredClients ?? []) {
    const name = clientDisplayName(c);
    const k = normalizeKey(name);
    if (k) keys.add(k);
  }
  return keys.size ? keys : null;
}

/** Substitui o ciclo corrente pelo kernel Executivo (283/61,5), nunca 408/63,7 audit-only. */
function applyRuntimeCurrentCycle(series, {
  consolidatedDoc,
  responses,
  cycles,
  cycleSummaryTemplate,
  filteredClients,
  clientFilters,
}) {
  const current = consolidatedDoc?.meta?.current_cycle_label;
  if (!current) {
    return series;
  }

  if (!responses?.length) {
    const snap = consolidatedDoc?.meta?.canonical_current_cycle;
    if (!snap) return series;
    const point = {
      measurement: current,
      responses: snap.responses,
      distinct_clients: snap.unique_clients ?? snap.responses,
      promoters: snap.promoters,
      neutrals: snap.neutrals,
      detractors: snap.detractors,
      nps: snap.nps,
      average_score: snap.average_score ?? null,
      source: 'BASE_QV',
      source_label: 'Ciclo analítico PHARUS',
      analytical_cycle: snap.analytical_cycle ?? null,
      source_window: snap.source_window ?? null,
      universe: snap.universe ?? null,
      is_canonical_current: true,
    };
    const idx = series.findIndex((s) => s.measurement === current);
    if (idx >= 0) {
      const next = [...series];
      next[idx] = point;
      return next;
    }
    return [...series, point].sort(
      (a, b) => cycleSortKey(a.measurement) - cycleSortKey(b.measurement),
    );
  }

  const explicit = hasExplicitHistorico2Filters(clientFilters ?? {});
  if (explicit) {
    return series;
  }

  const cycleDef = resolveSourceCycleDefForMeasurement(cycles, current);
  const point = buildCanonicalCurrentCycleNpsPoint({
    responses,
    cycles,
    cycleDef,
    cycleSummaryTemplate,
    measurementLabel: current,
  });
  if (!point) return series;

  const idx = series.findIndex((s) => s.measurement === current);
  if (idx >= 0) {
    const next = [...series];
    next[idx] = point;
    return next;
  }
  return [...series, point].sort(
    (a, b) => cycleSortKey(a.measurement) - cycleSortKey(b.measurement),
  );
}

function resolveSourceCycleDefForMeasurement(cycles, measurementLabel) {
  for (const c of cycles ?? []) {
    if (c.type === 'source_cycle' && canonicalizeNpsCycle(c.cycle_code) === measurementLabel) {
      return c;
    }
  }
  return (cycles ?? []).find((c) => c.type === 'source_cycle') ?? null;
}

function mapConsolidatedMeasurementsToOperationalChart(measurements, currentLabel) {
  return (measurements ?? [])
    .filter((m) => {
      const label = m.cycle ?? m.label;
      if (label !== currentLabel) return true;
      return !isAuditFullT3MeasurementRow(m);
    })
    .map((m) => {
      const label = m.cycle ?? m.label;
      const auditOnly = label === currentLabel && isAuditFullT3MeasurementRow(m);
      return {
        measurement: label,
        responses: m.responses ?? m.valid_responses ?? 0,
        distinct_clients: m.unique_clients ?? 0,
        promoters: m.promoters ?? 0,
        neutrals: m.neutrals ?? 0,
        detractors: m.detractors ?? 0,
        nps: m.nps ?? null,
        average_score: m.average_score ?? null,
        source: m.source ?? null,
        source_label: auditOnly
          ? 'Janela T3 completa BASE QV'
          : m.source_label ?? (m.source === 'BASE_QV' ? 'BASE QV' : 'Histórico oficial'),
        operational_role: m.operational_role ?? null,
        universe: m.universe ?? null,
      };
    });
}

/**
 * Série oficial NPS por medição — canônica para NPS Histórico e Safras & Cobertura.
 * @param {object} opts — mesmo contrato de buildMeasurementChartSeriesForPage
 */
export function getCanonicalMeasurementSeries(opts) {
  return buildMeasurementChartSeriesForPage(opts);
}

export function buildMeasurementChartSeriesForPage({
  consolidatedDoc,
  baseQvDoc,
  responses,
  cycles,
  historico2Doc,
  filteredClients,
  clientFilters,
  forceClientScope = false,
  cycleSummaryTemplate = null,
}) {
  if (!consolidatedDoc?.measurements?.length) {
    return [];
  }

  const explicit =
    hasExplicitHistorico2Filters(clientFilters ?? {}) || Boolean(forceClientScope);
  const filters = clientFilters ?? {};

  let series;
  if (explicit) {
    const clientIds = new Set((filteredClients ?? []).map((c) => c.client_id).filter(Boolean));
    const needsSafraLike =
      filters.cohort ||
      filters.status ||
      filters.npsCategory ||
      (filters.entryYear && filters.entryYear !== ENTRY_YEAR_ALL) ||
      filters.hasEntryDate ||
      filters.matchMethod ||
      filters.search?.trim();

    const aggregated = aggregateMeasurementsFromConsolidatedIndex(consolidatedDoc.response_index, {
      program: filters.program || null,
      ep: filters.ep || null,
      clientNameKeys: needsSafraLike ? clientNameKeysForHistoricoFilter(filteredClients) : null,
      clientIds: clientIds.size ? clientIds : null,
    });

    series = aggregated.map((row) => ({
      measurement: row.measurement,
      responses: row.valid_responses,
      distinct_clients: row.distinct_clients,
      promoters: row.promoters,
      neutrals: row.neutrals,
      detractors: row.detractors,
      nps: row.nps,
      average_score: row.average_score ?? null,
      source: row.source,
      source_label: row.source_label,
    }));

    if (explicit && clientIds.size && baseQvDoc?.response_index?.length) {
      const current = consolidatedDoc.meta?.current_cycle_label;
      const bqSeries = aggregateMeasurementsFromBaseQvIndex(baseQvDoc.response_index, clientIds);
      const currentFromBq = bqSeries.find((s) => s.measurement === current);
      if (currentFromBq) {
        const idx = series.findIndex((s) => s.measurement === current);
        const point = {
          measurement: current,
          responses: currentFromBq.valid_responses,
          distinct_clients: currentFromBq.distinct_clients,
          promoters: currentFromBq.promoters,
          neutrals: currentFromBq.neutrals,
          detractors: currentFromBq.detractors,
          nps: currentFromBq.nps,
          source: 'BASE_QV',
          source_label: 'BASE QV',
        };
        if (idx >= 0) series[idx] = point;
        else series.push(point);
        series.sort((a, b) => cycleSortKey(a.measurement) - cycleSortKey(b.measurement));
      }
    }
  } else {
    const currentLabel = consolidatedDoc.meta?.current_cycle_label;
    series = mapConsolidatedMeasurementsToOperationalChart(
      consolidatedDoc.measurements,
      currentLabel,
    );
    series = applyRuntimeCurrentCycle(series, {
      consolidatedDoc,
      responses,
      cycles,
      cycleSummaryTemplate,
      filteredClients,
      clientFilters,
    });
  }

  return series;
}

export { buildCanonicalCurrentCycleNpsPoint, canonicalCurrentCycleKpiFromPoint } from './canonical-current-cycle-nps.mjs';
