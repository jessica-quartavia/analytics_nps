import { cycleSortKey } from '../utils/cycle-sort.mjs';
import { canonicalizeNpsCycle, formatNpsCycleLabel } from '../utils/nps-cycle-labels.mjs';
import { median } from './historico-nps-enriched-view.mjs';

function officialCyclesFromSummary(summaryDoc) {
  const cycles = summaryDoc?.summary?.cycles ?? summaryDoc?.cycles ?? [];
  return cycles.filter((c) => c.is_official);
}

function isCanonicalQuarter(label) {
  return /^\d{4}-Q\d$/.test(String(label ?? ''));
}

function quarterYear(label) {
  return Number(String(label).slice(0, 4));
}

/** Respostas enriquecidas (PIT) restritas ao recorte de clientes Histórico 2. */
export function enrichedRowsForHistorico2Clients(enrichedDoc, filteredClients) {
  const ids = new Set((filteredClients ?? []).map((c) => c.client_id).filter(Boolean));
  if (!ids.size) return [];
  const rows = enrichedDoc?.responses ?? enrichedDoc ?? [];
  return (Array.isArray(rows) ? rows : []).filter((r) => ids.has(r.client_id));
}

function recurrenceCounts(enrichedRows) {
  const map = new Map();
  for (const r of enrichedRows) {
    if (!r.client_id) continue;
    map.set(r.client_id, (map.get(r.client_id) ?? 0) + 1);
  }
  return map;
}

/**
 * KPIs executivos (mesma família do Histórico NPS), recalculados no recorte filtrado quando aplicável.
 */
export function buildHistorico2ExecutiveKpis({
  filteredClients,
  enrichedDoc,
  historicalSummaryDoc,
  liveOfficialSummary,
  livePreviousOfficialSummary,
  currentCycleCode,
}) {
  const enrichedRows = enrichedRowsForHistorico2Clients(enrichedDoc, filteredClients);
  const official = officialCyclesFromSummary(historicalSummaryDoc);
  const lastOff = official[official.length - 1] ?? null;
  const prevOff = official[official.length - 2] ?? null;

  const currentCanonical =
    lastOff?.ciclo != null
      ? canonicalizeNpsCycle(lastOff.ciclo)
      : currentCycleCode
        ? canonicalizeNpsCycle(currentCycleCode)
        : null;

  let officialNps = lastOff?.nps_oficial ?? null;
  let officialCycleLabel = lastOff?.ciclo ? formatNpsCycleLabel(lastOff.ciclo) : currentCanonical ?? '—';

  if (liveOfficialSummary?.nps != null && !Number.isNaN(Number(liveOfficialSummary.nps))) {
    officialNps = Number(liveOfficialSummary.nps);
    if (currentCycleCode) {
      officialCycleLabel = formatNpsCycleLabel(currentCycleCode);
    }
  }

  let variation = null;
  if (liveOfficialSummary?.nps != null && livePreviousOfficialSummary?.nps != null) {
    variation =
      Math.round((Number(liveOfficialSummary.nps) - Number(livePreviousOfficialSummary.nps)) * 10) / 10;
  } else if (lastOff?.nps_oficial != null && prevOff?.nps_oficial != null) {
    variation = Math.round((lastOff.nps_oficial - prevOff.nps_oficial) * 10) / 10;
  } else if (lastOff?.variacao_vs_anterior != null) {
    variation = lastOff.variacao_vs_anterior;
  }

  const cycleResponses = currentCanonical
    ? enrichedRows.filter((r) => canonicalizeNpsCycle(r.nps_cycle) === currentCanonical).length
    : enrichedRows.length;

  const recMap = recurrenceCounts(enrichedRows);
  const uniqueHistoricalClients = recMap.size;
  const recurringClients = [...recMap.values()].filter((n) => n >= 2).length;

  const tenureMed = median(enrichedRows.map((r) => r.months_since_entry).filter((n) => n != null));
  const meetMed = median(
    enrichedRows.map((r) => r.meetings_before_response).filter((n) => Number.isFinite(n)),
  );
  const mechKnown = enrichedRows.filter((r) => r.mechanism_temporal_status !== 'date_unavailable');
  const mechPct = mechKnown.length
    ? Math.round(
        (1000 * mechKnown.filter((r) => r.has_implemented_mechanism_at_response).length) / mechKnown.length,
      ) / 10
    : null;

  return {
    officialNps,
    officialCycleLabel,
    variation,
    cycleResponses,
    currentCanonical,
    uniqueHistoricalClients,
    recurringClients,
    tenureMedianMonths: tenureMed,
    tenureSampleN: enrichedRows.length,
    meetingsMedian: meetMed,
    mechanismPct: mechPct,
    mechanismKnownN: mechKnown.length,
  };
}

/** Respostas por medição (trimestre canônico), 2025+. */
export function buildMeasurementResponseSeries(enrichedRows) {
  const counts = new Map();
  for (const r of enrichedRows ?? []) {
    const canon = canonicalizeNpsCycle(r.nps_cycle);
    if (!isCanonicalQuarter(canon)) continue;
    if (quarterYear(canon) < 2025) continue;
    counts.set(canon, (counts.get(canon) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => cycleSortKey(a) - cycleSortKey(b))
    .map(([measurement, responses]) => ({ measurement, responses }));
}
