import {
  sortCyclesBySequence,
  getLatestCycleBySequence,
  getPreviousCycleCode,
  buildSummaryMap,
  getCycleSummaryFromMap,
  getResponsesForCycle,
  getPairedCyclesForCurrent,
  getMigrationMatrixForCurrent,
  getActionQueueForCycle,
  summarizeQuality,
  getEpSummaryEntries,
  getEpResponsesForCycle,
  hasVocData,
  getTopicSummaryEntries,
  getResponseTopicsForCycle,
  getTopicOptions,
  buildVocCommentRows,
  sortTopicSummaries,
  computeVocPageKpis,
  buildClientSatMap,
  getCsatSummaryForCycle,
  getActionQueueEnrichedForCycle,
  mergeActionTrackingIntoQueue,
} from './store-core.mjs';

let state = null;
let summaryMap = null;

const PATHS = {
  cycles: '/data/processed/cycles.json',
  responses: '/data/processed/responses.json',
  cycleSummary: '/data/processed/cycle_summary.json',
  paired: '/data/processed/paired_cycles.json',
  migration: '/data/processed/migration_matrix.json',
  eligible: '/data/processed/eligible_clients.json',
  actionQueue: '/data/outputs/action_queue.json',
  quality: '/data/quality/data_quality.json',
  snapshot: '/data/snapshots/latest.json',
  epSummary: '/data/processed/ep_summary.json',
  responseTopics: '/data/processed/response_topics.json',
  topicSummary: '/data/processed/topic_summary.json',
  csatSummary: '/data/processed/csat_summary.json',
  clientSatisfaction: '/data/processed/client_satisfaction_summary.json',
  driversSummary: '/data/processed/drivers_summary.json',
  driverTests: '/data/processed/driver_tests.json',
  commentDrivers: '/data/processed/comment_drivers.json',
  actionQueueEnriched: '/data/processed/action_queue_enriched.json',
  actionTracking: '/data/operational/action_tracking.json',
  executiveDiagnosis: '/data/processed/executive_diagnosis.json',
};

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Falha ao carregar ${url} (${res.status})`);
  return res.json();
}

async function fetchJsonOptional(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export async function loadAnalyticsData() {
  const [
    cycles,
    responses,
    cycleSummaryDoc,
    pairedCycles,
    migrationMatrix,
    eligibleClients,
    actionQueue,
    qualityDoc,
    snapshot,
    epSummaryDoc,
    responseTopics,
    topicSummaryDoc,
    csatSummaryDoc,
    clientSatisfactionDoc,
    driversSummaryDoc,
    driverTestsDoc,
    commentDriversDoc,
    actionQueueEnrichedDoc,
    actionTrackingDoc,
    executiveDiagnosisDoc,
  ] = await Promise.all([
    fetchJson(PATHS.cycles),
    fetchJson(PATHS.responses),
    fetchJson(PATHS.cycleSummary),
    fetchJson(PATHS.paired),
    fetchJson(PATHS.migration),
    fetchJson(PATHS.eligible),
    fetchJson(PATHS.actionQueue),
    fetchJson(PATHS.quality),
    fetchJson(PATHS.snapshot),
    fetchJsonOptional(PATHS.epSummary),
    fetchJsonOptional(PATHS.responseTopics),
    fetchJsonOptional(PATHS.topicSummary),
    fetchJsonOptional(PATHS.csatSummary),
    fetchJsonOptional(PATHS.clientSatisfaction),
    fetchJsonOptional(PATHS.driversSummary),
    fetchJsonOptional(PATHS.driverTests),
    fetchJsonOptional(PATHS.commentDrivers),
    fetchJsonOptional(PATHS.actionQueueEnriched),
    fetchJsonOptional(PATHS.actionTracking),
    fetchJsonOptional(PATHS.executiveDiagnosis),
  ]);

  const actionQueueEnrichedBase = actionQueueEnrichedDoc?.entries ?? [];
  const trackingNormalized = actionTrackingDoc ?? { entries: [] };
  const enrichedMerged = mergeActionTrackingIntoQueue(
    actionQueueEnrichedBase,
    trackingNormalized,
  );

  state = {
    cycles,
    responses,
    cycleSummaryDoc,
    pairedCycles,
    migrationMatrix,
    eligibleClients,
    actionQueue,
    qualityDoc,
    snapshot,
    epSummaryDoc,
    responseTopics: Array.isArray(responseTopics) ? responseTopics : [],
    topicSummaryDoc,
    csatSummaryDoc,
    clientSatisfactionDoc,
    clientSatMap: buildClientSatMap(clientSatisfactionDoc),
    driversSummaryDoc,
    driverTestsDoc: Array.isArray(driverTestsDoc) ? driverTestsDoc : [],
    commentDriversDoc: Array.isArray(commentDriversDoc) ? commentDriversDoc : [],
    actionQueueEnrichedBase,
    actionQueueEnrichedDoc: actionQueueEnrichedDoc
      ? { ...actionQueueEnrichedDoc, entries: enrichedMerged }
      : null,
    actionTrackingDoc: trackingNormalized,
    executiveDiagnosisDoc: executiveDiagnosisDoc ?? null,
    dataCutoff: cycleSummaryDoc?.data_cutoff ?? snapshot?.at ?? null,
  };
  summaryMap = buildSummaryMap(cycleSummaryDoc);
  return state;
}

export function isLoaded() {
  return state != null;
}

export function getDataState() {
  return state;
}

export function getSnapshot() {
  return state?.snapshot ?? null;
}

export function getCycles() {
  return sortCyclesBySequence(state?.cycles ?? []);
}

export function getLatestCycle() {
  return getLatestCycleBySequence(state?.cycles ?? []);
}

export function getPreviousCycle(currentCode) {
  const code = getPreviousCycleCode(state?.cycles ?? [], currentCode);
  if (!code) return null;
  return (state?.cycles ?? []).find((c) => c.cycle_code === code) ?? null;
}

export function getCycleSummary(cycleCode) {
  return getCycleSummaryFromMap(summaryMap, cycleCode);
}

export function getResponses(cycleCode) {
  return getResponsesForCycle(state?.responses ?? [], cycleCode);
}

export function getPairedCycles(currentCycleCode) {
  return getPairedCyclesForCurrent(state?.pairedCycles, currentCycleCode);
}

export function getMigrationMatrix(currentCycleCode) {
  return getMigrationMatrixForCurrent(state?.migrationMatrix, currentCycleCode);
}

export function getActionQueue(cycleCode) {
  return getActionQueueForCycle(state?.actionQueue ?? [], cycleCode);
}

export function getQualitySummary() {
  return summarizeQuality(state?.qualityDoc ?? { entries: [] });
}

export function hasEpSummary() {
  return state?.epSummaryDoc != null && Array.isArray(state.epSummaryDoc.entries);
}

export function getEpSummaryDoc() {
  return state?.epSummaryDoc ?? null;
}

export function getEpSummary(cycleCode) {
  return getEpSummaryEntries(state?.epSummaryDoc, cycleCode);
}

export function getEpResponses(cycleCode, epIdOrName) {
  return getEpResponsesForCycle(state?.responses ?? [], cycleCode, epIdOrName);
}

export function hasVocArtifacts() {
  return hasVocData(state?.topicSummaryDoc, state?.responseTopics);
}

export function getTopicSummary(cycleCode) {
  return getTopicSummaryEntries(state?.topicSummaryDoc, cycleCode);
}

export function getResponseTopics(cycleCode) {
  return getResponseTopicsForCycle(state?.responseTopics ?? [], cycleCode);
}

export function getVocClassificationMeta() {
  return state?.topicSummaryDoc?.classification ?? null;
}

export function getTopicFilterOptions(cycleCode) {
  return getTopicOptions(state?.responseTopics ?? [], cycleCode);
}

export function getVocCommentTableRows(cycleCode, filters) {
  return buildVocCommentRows(state?.responses ?? [], state?.responseTopics ?? [], cycleCode, filters);
}

export function getSortedTopicSummaries(cycleCode, sortKey, dir) {
  return sortTopicSummaries(getTopicSummary(cycleCode), sortKey, dir);
}

export function getVocPageKpis(cycleCode) {
  return computeVocPageKpis(state?.responses ?? [], state?.responseTopics ?? [], cycleCode);
}

export function hasCsatArtifacts() {
  return state?.csatSummaryDoc != null && Array.isArray(state.csatSummaryDoc.cycles);
}

export function getCsatSummary(cycleCode) {
  return getCsatSummaryForCycle(state?.csatSummaryDoc, cycleCode);
}

export function getClientSatisfaction(clientId) {
  return state?.clientSatMap?.get(clientId) ?? null;
}

export function getClientSatMap() {
  return state?.clientSatMap ?? new Map();
}

export function hasDriversArtifacts() {
  return state?.driversSummaryDoc != null && Array.isArray(state?.driverTestsDoc);
}

export function getDriversSummary() {
  return state?.driversSummaryDoc ?? null;
}

export function getDriverTests(cycleCode) {
  return (state?.driverTestsDoc ?? []).filter((t) => t.cycle_code === cycleCode);
}

export function getCommentDrivers(cycleCode) {
  return (state?.commentDriversDoc ?? []).filter((t) => t.analytical_cycle_code === cycleCode);
}

export function hasActionPlanArtifacts() {
  return (
    state?.actionQueueEnrichedDoc != null &&
    Array.isArray(state.actionQueueEnrichedDoc.entries)
  );
}

export function getActionPlanRows(cycleCode) {
  return getActionQueueEnrichedForCycle(state?.actionQueueEnrichedDoc, cycleCode);
}

export function getActionPlanMeta(cycleCode) {
  const doc = state?.actionQueueEnrichedDoc;
  if (!doc?.meta) return null;
  if (doc.meta.cycle_code && doc.meta.cycle_code !== cycleCode) {
    return { ...doc.meta, cycle_code: cycleCode };
  }
  return doc.meta;
}

/** Atualiza cache local após salvar tracking (dev server). */
export function getExecutiveDiagnosis(cycleCode) {
  const doc = state?.executiveDiagnosisDoc;
  if (!doc) return null;
  if (doc.cycle_code && cycleCode && doc.cycle_code !== cycleCode) return null;
  return doc;
}

export function hasExecutiveDiagnosis(cycleCode) {
  return getExecutiveDiagnosis(cycleCode) != null;
}

export function patchLocalActionTracking(entry) {
  if (!state?.actionQueueEnrichedBase || !entry?.client_id) return;
  const doc = { entries: [...(state.actionTrackingDoc?.entries ?? [])] };
  const idx = doc.entries.findIndex(
    (e) => e.client_id === entry.client_id && e.cycle_code === entry.cycle_code,
  );
  if (idx >= 0) doc.entries[idx] = entry;
  else doc.entries.push(entry);
  doc.updated_at = entry.updated_at ?? new Date().toISOString();
  state.actionTrackingDoc = doc;
  state.actionQueueEnrichedDoc = {
    ...state.actionQueueEnrichedDoc,
    entries: mergeActionTrackingIntoQueue(state.actionQueueEnrichedBase, doc),
  };
}

export { getPreviousCycleCode, buildSummaryMap };
