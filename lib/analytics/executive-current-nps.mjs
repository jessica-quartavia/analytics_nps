import {
  aggregateNpsFromResponses,
  dedupeLatestNpsByClient,
  npsResponseTimestampMs,
  npsScoreFromRow,
} from './nps.mjs';
import { buildScoreDistribution } from './cycle-summary.mjs';

/**
 * Universo oficial do card "NPS atual" no Executivo (recorte padrão).
 * Última resposta válida por cliente em responses.json (PHARUS), sem BASE0.
 * Não é média de NPS por ciclo — recálculo direto sobre clientes.
 */
export function rowsForExecutiveCurrentNps(responses) {
  return (responses ?? []).filter((r) => r.program === 'PHARUS' && npsScoreFromRow(r) != null);
}

export function computeExecutiveCurrentNpsAggregate(responses) {
  return aggregateNpsFromResponses(rowsForExecutiveCurrentNps(responses), {
    dedupe: true,
    requireClientId: true,
  });
}

/**
 * Summary no formato cycle_summary para KPIs do Executivo.
 * @param {object} template cycle_summary entry (metadados: ciclo, IC95, elegíveis…)
 */
export function buildExecutiveCurrentNpsSummary(responses, template = {}) {
  const rows = rowsForExecutiveCurrentNps(responses);
  const deduped = dedupeLatestNpsByClient(rows, { requireClientId: true });
  const agg = aggregateNpsFromResponses(deduped, { dedupe: false });
  const score_distribution = buildScoreDistribution(
    deduped.map((r) => ({ score: npsScoreFromRow(r) })),
  );

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
    score_distribution,
    nps_ci_low: null,
    nps_ci_high: null,
    response_rate: null,
    _nps_universe: 'pharus_latest_per_client_responses_json',
    _nps_kernel: 'aggregateNpsFromResponses',
  };
}

/** Ciclo SET-only (artefato cycle_summary — comparação / IC95). */
export function computeCycleOnlyAggregate(responses, cycleCode) {
  const rows = (responses ?? []).filter(
    (r) => r.analytical_cycle_code === cycleCode && npsScoreFromRow(r) != null,
  );
  return aggregateNpsFromResponses(rows);
}

function cycleEndMs(cycleDef) {
  if (!cycleDef?.ends_at) return null;
  const t = Date.parse(String(cycleDef.ends_at));
  return Number.isNaN(t) ? null : t;
}

/**
 * NPS “global” no fechamento do ciclo anterior: última resposta por cliente
 * entre respostas com submitted_at ≤ ends_at do ciclo anterior.
 */
export function computeExecutivePreviousNpsAggregate(responses, previousCycleDef) {
  const endMs = cycleEndMs(previousCycleDef);
  if (endMs == null) return null;
  const rows = rowsForExecutiveCurrentNps(responses).filter(
    (r) => npsResponseTimestampMs(r) <= endMs,
  );
  return aggregateNpsFromResponses(rows, { dedupe: true, requireClientId: true });
}

export function buildExecutivePreviousNpsSummary(responses, previousCycleDef, template = {}) {
  const agg = computeExecutivePreviousNpsAggregate(responses, previousCycleDef);
  if (!agg) return null;
  const endMs = cycleEndMs(previousCycleDef);
  const rows = rowsForExecutiveCurrentNps(responses).filter(
    (r) => npsResponseTimestampMs(r) <= endMs,
  );
  const deduped = dedupeLatestNpsByClient(rows, { requireClientId: true });
  const score_distribution = buildScoreDistribution(
    deduped.map((r) => ({ score: npsScoreFromRow(r) })),
  );
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
    score_distribution,
    _nps_universe: 'pharus_latest_per_client_until_previous_cycle_end',
    _nps_kernel: 'aggregateNpsFromResponses',
  };
}

/** Auditoria lado a lado: ciclo analítico (card antigo) vs NPS atual global (kernel). */
export function buildExecutiveNpsSideBySide(responses, cycleCode, cycleSummaryEntry = null) {
  const cycleAgg = computeCycleOnlyAggregate(responses, cycleCode);
  const globalAgg = computeExecutiveCurrentNpsAggregate(responses);
  return {
    cycle_code: cycleCode,
    cycle_only: {
      universe: 'analytical_cycle_code',
      ...cycleAgg,
      cycle_summary_artifact_nps: cycleSummaryEntry?.nps ?? null,
      dashboard_legacy_display: cycleSummaryEntry?.nps ?? null,
    },
    executive_current_global: {
      universe: 'pharus_latest_per_client_responses_json',
      ...globalAgg,
    },
    delta_nps: globalAgg.nps != null && cycleAgg.nps != null ? globalAgg.nps - cycleAgg.nps : null,
  };
}
