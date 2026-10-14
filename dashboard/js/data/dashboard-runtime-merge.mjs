import { buildSummaryMap, getLatestCycleBySequence } from './store-core.mjs';
import { buildExecutiveCurrentNpsSummary } from './executive-official-nps.mjs';
import { matchesOfficialSourceCycleWindow } from '../../../lib/analytics/nps.mjs';

const CURRENT_SET_CYCLE = 'NPS-2026-SET-PHARUS';

/**
 * Aplica payload runtime ao state (substitui datasets, não só metadata).
 * @param {object} state
 * @param {object} runtime
 * @param {object} helpers
 */
export function applyRuntimeRefreshPayload(state, runtime, helpers) {
  if (!state || !runtime?.datasets) return { applied: false, reason: 'missing_datasets' };
  const d = runtime.datasets;

  if (d.cycles) state.cycles = d.cycles;
  if (Array.isArray(d.responses)) {
    state.responses = d.responses;
  }
  if (d.cycle_summary) state.cycleSummaryDoc = d.cycle_summary;
  if (d.paired_cycles) state.pairedCycles = d.paired_cycles;
  if (d.migration_matrix) state.migrationMatrix = d.migration_matrix;
  if (d.ep_summary) state.epSummaryDoc = d.ep_summary;
  if (d.executive_diagnosis) state.executiveDiagnosisDoc = d.executive_diagnosis;
  if (Array.isArray(d.response_topics)) state.responseTopics = d.response_topics;
  if (d.topic_summary) state.topicSummaryDoc = d.topic_summary;
  if (d.drivers_summary) state.driversSummaryDoc = d.drivers_summary;
  if (Array.isArray(d.driver_tests)) state.driverTestsDoc = d.driver_tests;
  if (Array.isArray(d.comment_drivers)) state.commentDriversDoc = d.comment_drivers;
  if (d.csat_summary) state.csatSummaryDoc = d.csat_summary;
  if (d.client_satisfaction_summary) {
    state.clientSatisfactionDoc = d.client_satisfaction_summary;
    state.clientSatMap = helpers.buildClientSatMap(d.client_satisfaction_summary);
  }
  if (Array.isArray(d.action_queue)) state.actionQueue = d.action_queue;
  if (d.action_queue_enriched) {
    state.actionQueueEnrichedBase = d.action_queue_enriched.entries ?? [];
    state.actionQueueEnrichedDoc = {
      ...d.action_queue_enriched,
      entries: d.action_queue_enriched.entries ?? [],
    };
    helpers.refreshActionQueueEnrichedEntries?.();
  }
  if (d.snapshot) state.snapshot = d.snapshot;

  state.dataCutoff =
    d.cycle_summary?.data_cutoff ?? d.snapshot?.data_cutoff ?? state.dataCutoff ?? null;

  if (runtime.latest_nps_response_at) {
    state.latestNpsResponseAt = runtime.latest_nps_response_at;
  }

  syncExecutiveCycleSummaryFromResponses(state);

  let summaryMap = buildSummaryMap(state.cycleSummaryDoc);
  return { applied: true, summaryMap, responsesCount: state.responses?.length ?? 0 };
}

/** Alinha entrada SET do cycle_summary ao kernel executivo (mesmo universo que KPIs). */
/**
 * Refresh leve: substitui respostas na janela oficial T3 e recalcula cycle_summary do ciclo corrente.
 * @param {object} state
 * @param {object} lightPayload resposta /api/dashboard/current-nps
 */
export function applyLightCurrentNpsPayload(state, lightPayload) {
  if (!state?.responses || !lightPayload?.datasets?.window_responses) {
    return { applied: false, reason: 'missing_window_responses' };
  }
  const bounds = lightPayload.window_bounds ?? {};
  const incoming = lightPayload.datasets.window_responses;
  const kept = (state.responses ?? []).filter((r) => !matchesOfficialSourceCycleWindow(r, bounds));
  state.responses = [...kept, ...incoming];

  const kpis = lightPayload.executive_current_kpis;
  const cycleCode = lightPayload.datasets.cycle_code ?? CURRENT_SET_CYCLE;
  if (state.cycleSummaryDoc?.cycles && kpis) {
    state.cycleSummaryDoc = {
      ...state.cycleSummaryDoc,
      cycles: state.cycleSummaryDoc.cycles.map((c) =>
        c.cycle_code === cycleCode
          ? {
              ...c,
              valid_responses: kpis.valid_responses,
              promoters: kpis.promoters,
              passives: kpis.neutrals,
              detractors: kpis.detractors,
              nps: kpis.nps,
              average_score: kpis.average_score,
              eligible_clients: kpis.eligible_clients ?? c.eligible_clients,
              response_rate: kpis.response_rate ?? c.response_rate,
            }
          : c,
      ),
    };
  } else {
    syncExecutiveCycleSummaryFromResponses(state);
  }

  if (lightPayload.latest_nps_response_at) {
    state.latestNpsResponseAt = lightPayload.latest_nps_response_at;
  }

  const summaryMap = buildSummaryMap(state.cycleSummaryDoc);
  return {
    applied: true,
    summaryMap,
    responsesCount: state.responses.length,
    windowCount: incoming.length,
  };
}

export function syncExecutiveCycleSummaryFromResponses(state) {
  const latest = getLatestCycleBySequence(state.cycles ?? []);
  if (!latest?.cycle_code || !Array.isArray(state.cycleSummaryDoc?.cycles)) return;
  const template =
    state.cycleSummaryDoc.cycles.find((c) => c.cycle_code === latest.cycle_code) ?? {};
  const live = buildExecutiveCurrentNpsSummary(state.responses ?? [], template, latest);
  state.cycleSummaryDoc = {
    ...state.cycleSummaryDoc,
    cycles: state.cycleSummaryDoc.cycles.map((c) =>
      c.cycle_code === latest.cycle_code
        ? {
            ...c,
            valid_responses: live.valid_responses,
            promoters: live.promoters,
            passives: live.passives,
            detractors: live.detractors,
            promoter_pct: live.promoter_pct,
            passive_pct: live.passive_pct,
            detractor_pct: live.detractor_pct,
            nps: live.nps,
            average_score: live.average_score,
          }
        : c,
    ),
  };
}
