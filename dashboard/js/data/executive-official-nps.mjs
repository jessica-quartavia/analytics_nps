/**
 * NPS atual Executivo — kernel no browser (apenas nps-kernel / nps.mjs em dist).
 * Última resposta PHARUS válida por client_id em responses.json.
 */
import {
  aggregateNpsFromResponses,
  dedupeLatestNpsByClient,
  npsResponseTimestampMs,
  npsScoreFromRow,
} from '../utils/nps-kernel.mjs';

export function rowsForExecutiveCurrentNps(responses) {
  return (responses ?? []).filter((r) => r.program === 'PHARUS' && npsScoreFromRow(r) != null);
}

export function buildExecutiveCurrentNpsSummary(responses, template = {}) {
  const rows = rowsForExecutiveCurrentNps(responses);
  const deduped = dedupeLatestNpsByClient(rows, { requireClientId: true });
  const agg = aggregateNpsFromResponses(deduped, { dedupe: false });
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
    _nps_universe: 'pharus_latest_per_client_responses_json',
  };
}

function cycleEndMs(cycleDef) {
  if (!cycleDef?.ends_at) return null;
  const t = Date.parse(String(cycleDef.ends_at));
  return Number.isNaN(t) ? null : t;
}

export function buildExecutivePreviousNpsSummary(responses, previousCycleDef, template = {}) {
  const endMs = cycleEndMs(previousCycleDef);
  if (endMs == null) return null;
  const rows = rowsForExecutiveCurrentNps(responses).filter(
    (r) => npsResponseTimestampMs(r) <= endMs,
  );
  const agg = aggregateNpsFromResponses(rows, { dedupe: true, requireClientId: true });
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
    _nps_universe: 'pharus_latest_per_client_until_previous_cycle_end',
  };
}
