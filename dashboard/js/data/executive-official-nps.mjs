/**
 * NPS atual Executivo — kernel no browser (apenas nps-kernel / nps.mjs em dist).
 * Recorte por ciclo analítico → dedupe por cliente → agregação oficial.
 */
import {
  aggregateNpsForAnalyticalCycle,
  aggregateNpsForOfficialSourceCycleWindow,
  npsResponseTimestampMs,
  npsScoreFromRow,
  aggregateNpsFromResponses,
  latestNpsResponseMeta,
} from '../utils/nps-kernel.mjs';

export function rowsForExecutiveCurrentNps(responses, cycleCode) {
  let rows = (responses ?? []).filter((r) => r.program === 'PHARUS' && npsScoreFromRow(r) != null);
  if (cycleCode) {
    rows = rows.filter((r) => r.analytical_cycle_code === cycleCode);
  }
  return rows;
}

export function buildExecutiveCurrentNpsSummary(responses, template = {}, cycleDef = {}) {
  const cycleCode = template.cycle_code ?? cycleDef.cycle_code ?? null;
  const bounds =
    cycleDef.starts_at != null || cycleDef.ends_at != null
      ? { starts_at: cycleDef.starts_at ?? null, ends_at: cycleDef.ends_at ?? null }
      : template.starts_at != null || template.ends_at != null
        ? { starts_at: template.starts_at ?? null, ends_at: template.ends_at ?? null }
        : null;
  const useOfficialWindow = cycleDef.type === 'source_cycle' && bounds != null;

  const agg = useOfficialWindow
    ? aggregateNpsForOfficialSourceCycleWindow(responses, bounds)
    : aggregateNpsForAnalyticalCycle(responses, cycleCode, { program: 'PHARUS' });

  return {
    ...template,
    valid_responses: agg.responses,
    promoters: agg.promoters,
    passives: agg.neutrals,
    detractors: agg.detractors,
    promoter_pct: agg.promoter_pct,
    passive_pct: agg.neutral_pct,
    detractor_pct: agg.detractor_pct,
    nps: agg.nps,
    average_score: agg.average_score,
    nps_ci_low: null,
    nps_ci_high: null,
    response_rate: template.response_rate ?? null,
    eligible_clients: template.eligible_clients ?? null,
    latest_nps_response_at: agg.latest_nps_response_at,
    latest_nps_response_id: agg.latest_nps_response_id,
    latest_nps_client_id: agg.latest_nps_client_id,
    latest_nps_score: agg.latest_nps_score,
    _nps_universe: useOfficialWindow
      ? 'source_window_geral_dedupe_latest_per_client'
      : 'pharus_dedupe_within_analytical_cycle',
  };
}

function cycleEndMs(cycleDef) {
  if (!cycleDef?.ends_at) return null;
  const t = Date.parse(String(cycleDef.ends_at));
  return Number.isNaN(t) ? null : t;
}

export function buildExecutivePreviousNpsSummary(responses, previousCycleDef, template = {}) {
  const endMs = cycleEndMs(previousCycleDef);
  const cycleCode = previousCycleDef?.cycle_code ?? template.cycle_code ?? null;
  if (endMs == null && !cycleCode) return null;
  let rows = rowsForExecutiveCurrentNps(responses, cycleCode);
  if (endMs != null) {
    rows = rows.filter((r) => npsResponseTimestampMs(r) <= endMs);
  }
  const agg = aggregateNpsFromResponses(rows, { dedupe: true, requireClientId: true });
  const latest = latestNpsResponseMeta(rows, { dedupe: true, requireClientId: true });
  return {
    ...template,
    valid_responses: agg.responses,
    promoters: agg.promoters,
    passives: agg.neutrals,
    detractors: agg.detractors,
    promoter_pct: agg.promoter_pct,
    passive_pct: agg.neutral_pct,
    detractor_pct: agg.detractor_pct,
    nps: agg.nps,
    nps_ci_low: null,
    nps_ci_high: null,
    response_rate: null,
    latest_nps_response_at: latest.latest_nps_response_at,
    _nps_universe: 'pharus_latest_per_client_until_previous_cycle_end',
  };
}
