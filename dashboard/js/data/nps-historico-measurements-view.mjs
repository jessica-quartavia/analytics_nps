import { cycleSortKey } from '../../../lib/analytics/nps-cycle-canonical.mjs';
import {
  aggregateMeasurementsFromConsolidatedIndex,
  mapConsolidatedMeasurementsToChart,
} from '../../../lib/analytics/nps-measurements-consolidated.mjs';
import {
  aggregateMeasurementsFromBaseQvIndex,
  buildNpsMeasurementsBaseQv,
} from '../../../lib/analytics/nps-measurements-baseqv.mjs';
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

/** Atualiza só o ciclo corrente com runtime BASE QV (paridade Executivo). */
function applyRuntimeCurrentCycle(series, {
  consolidatedDoc,
  baseQvDoc,
  responses,
  cycles,
  historico2Doc,
  filteredClients,
  clientFilters,
}) {
  const current = consolidatedDoc?.meta?.current_cycle_label;
  if (!current || !baseQvDoc?.analytical_cycles_config?.length || !responses?.length) {
    return series;
  }

  const explicit = hasExplicitHistorico2Filters(clientFilters ?? {});
  const clientIds = explicit
    ? new Set((filteredClients ?? []).map((c) => c.client_id).filter(Boolean))
    : null;

  const built = buildNpsMeasurementsBaseQv({
    responses,
    sourceCycles: sourceCyclesFromStore(cycles),
    clientsMap: clientsMapFromHistorico2(historico2Doc),
    analyticalConfig: baseQvDoc.analytical_cycles_config,
    clientIdsFilter: clientIds?.size ? clientIds : null,
  });
  const currentRow = built.measurements.find((m) => m.label === current);
  if (!currentRow) return series;

  const point = {
    measurement: current,
    responses: currentRow.deduped_responses ?? currentRow.valid_responses,
    distinct_clients: currentRow.unique_clients ?? currentRow.valid_responses,
    promoters: currentRow.promoters,
    neutrals: currentRow.neutrals,
    detractors: currentRow.detractors,
    nps: currentRow.nps,
    source: 'BASE_QV',
    source_label: 'BASE QV',
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

export function buildMeasurementChartSeriesForPage({
  consolidatedDoc,
  baseQvDoc,
  responses,
  cycles,
  historico2Doc,
  filteredClients,
  clientFilters,
}) {
  if (!consolidatedDoc?.measurements?.length) {
    return [];
  }

  const explicit = hasExplicitHistorico2Filters(clientFilters ?? {});
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
    series = mapConsolidatedMeasurementsToChart(consolidatedDoc.measurements);
    series = applyRuntimeCurrentCycle(series, {
      consolidatedDoc,
      baseQvDoc,
      responses,
      cycles,
      historico2Doc,
      filteredClients,
      clientFilters,
    });
  }

  return series;
}
