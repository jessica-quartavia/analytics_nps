import {
  getCanonicalMeasurementSeries,
} from './nps-historico-measurements-view.mjs';
import {
  COHORT_NO_ENTRY,
  defaultHistorico2Filters,
} from './historico2-view.mjs';
import { historico2ClientsForSafrasCohort } from './historico2-safras-adapter.mjs';

/** Filtros Safras que recortam a série por medição (≠ série oficial do NPS Histórico). */
export function hasSafrasMeasurementRecorte(filters) {
  const f = filters ?? {};
  if (f.npsPeriod && f.npsPeriod !== 'all') return true;
  if (f.safra) return true;
  if (f.programa) return true;
  if (f.ep) return true;
  if (f.status) return true;
  if (f.app && f.app !== 'all') return true;
  if (f.answered && f.answered !== 'all') return true;
  if (f.categoria) return true;
  if (f.minResponses) return true;
  if (String(f.search ?? '').trim()) return true;
  return false;
}

function historico2FiltersFromSafras(pageFilters) {
  const f = pageFilters ?? {};
  const cohort =
    f.safra === 'Sem data'
      ? COHORT_NO_ENTRY
      : f.safra || '';
  return {
    ...defaultHistorico2Filters(),
    cohort,
    program: f.programa || '',
    ep: f.ep || '',
    status: f.status || '',
    search: f.search || '',
  };
}

/**
 * Mesma série que NPS Histórico (`getCanonicalMeasurementSeries`), com recorte opcional por filtros Safras.
 */
export function buildSafrasMeasurementChartSeries({
  consolidatedDoc,
  baseQvDoc,
  responses,
  cycles,
  historico2Doc,
  filteredSafrasCustomers,
  pageFilters,
  cycleSummaryTemplate = null,
}) {
  const h2All = historico2Doc?.clients ?? [];
  const recorte = hasSafrasMeasurementRecorte(pageFilters);

  let filteredClients = h2All;
  let clientFilters = defaultHistorico2Filters();
  let forceClientScope = false;

  if (recorte) {
    filteredClients = historico2ClientsForSafrasCohort(h2All, filteredSafrasCustomers ?? []);
    clientFilters = historico2FiltersFromSafras(pageFilters);
    forceClientScope = true;
  }

  return getCanonicalMeasurementSeries({
    consolidatedDoc,
    baseQvDoc,
    responses,
    cycles,
    historico2Doc,
    filteredClients,
    clientFilters,
    forceClientScope,
    cycleSummaryTemplate,
  });
}

/** KPI NPS da medição corrente a partir da série canônica (paridade Histórico). */
export function officialMeasurementKpiFromSeries(series, consolidatedDoc) {
  const current = consolidatedDoc?.meta?.current_cycle_label;
  const row =
    (current ? series.find((s) => s.measurement === current) : null) ??
    series[series.length - 1] ??
    null;
  if (!row) return null;
  return {
    measurement: row.measurement,
    nps: row.nps,
    responses: row.responses,
    distinct_clients: row.distinct_clients,
    promoters: row.promoters,
    neutrals: row.neutrals,
    detractors: row.detractors,
    average_score: row.average_score ?? null,
    source_label: row.source_label ?? row.source ?? null,
    analytical_cycle: row.analytical_cycle ?? null,
    source_window: row.source_window ?? null,
    universe: row.universe ?? null,
  };
}
