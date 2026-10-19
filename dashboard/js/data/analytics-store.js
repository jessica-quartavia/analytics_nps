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
  buildVocGroupedCommentRows,
  sortTopicSummaries,
  computeVocPageKpis,
  computeVocPageKpisForFilters,
  buildClientSatMap,
  getCsatSummaryForCycle,
  getActionQueueEnrichedForCycle,
  mergeActionTrackingIntoQueue,
  mergeActionPlansIntoQueue,
} from './store-core.mjs';
import { buildGlobalFilterContext } from '../filters/filter-context.mjs';
import {
  buildExecutiveCurrentNpsSummary,
  buildExecutivePreviousNpsSummary,
} from './executive-official-nps.mjs';
import { applyRuntimeRefreshPayload, applyLightCurrentNpsPayload } from './dashboard-runtime-merge.mjs';
import { logDashboardRefreshDiagnostics } from './dashboard-refresh-diagnostics.mjs';
import { apiFetch } from './api-fetch.mjs';

let state = null;
let summaryMap = null;
let refreshInProgress = false;
/** @type {{ dataUpdatedAt: string | null, lastCheckedAt: string | null, snapshotFingerprint: string | null, runtimeFingerprint: string | null, dataSource: 'static' | 'runtime' | null, runtimeErrorCode: string | null }} */
let dataFreshness = {
  dataUpdatedAt: null,
  lastCheckedAt: null,
  snapshotFingerprint: null,
  runtimeFingerprint: null,
  dataSource: null,
  runtimeErrorCode: null,
  runtimeRefreshMode: null,
};
const RUNTIME_REFRESH_TIMEOUT_MS = 30_000;
/** @type {object | null} */
let dashboardServerConfig = null;
const dataRefreshListeners = new Set();

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
  actionPlans: '/data/operational/action_plans.json',
  executiveDiagnosis: '/data/processed/executive_diagnosis.json',
  populationAudit: '/data/quality/nps_population_audit.json',
  npsClientMilestones: '/data/processed/nps_client_milestones.json',
  npsMilestonesSummary: '/data/processed/nps_milestones_summary.json',
  npsBetweenCycleEvents: '/data/processed/nps_between_cycle_events.json',
  npsMilestonesQa: '/data/quality/nps_milestones_qa.json',
  npsChangeDrivers: '/data/processed/nps_change_drivers.json',
  npsChangeDriversQa: '/data/quality/nps_change_drivers_qa.json',
  npsFinancialProfile: '/data/processed/nps_financial_profile.json',
  npsFinancialProfileQa: '/data/quality/nps_financial_profile_qa.json',
  npsManagementInsights: '/data/processed/nps_management_insights.json',
  npsManagementInsightsQa: '/data/quality/nps_management_insights_qa.json',
  customerNpsCohorts: '/data/processed/customer_nps_cohorts.json',
  customerNpsHistory: '/data/processed/customer_nps_history.json',
  safrasCoberturaSummaries: '/data/processed/safras_cobertura_summaries.json',
  safrasCoberturaAudit: '/data/quality/safras_cobertura_audit.json',
  historicalNpsSummary: '/data/processed/historical_nps_summary.json',
  historicalNpsResponses: '/data/processed/historical_nps_responses.json',
  historicalNpsClients: '/data/processed/historical_nps_clients.json',
  historicalNpsFieldCoverage: '/data/processed/historical_nps_field_coverage.json',
  historicalNpsEnriched: '/data/processed/historical_nps_enriched.json',
  historicalNpsEnrichedQuality: '/data/quality/historical_nps_enriched_quality.json',
  cohortPaymentDateAudit: '/data/quality/cohort_payment_date_audit.json',
  npsAllPeriods: '/data/processed/nps_all_periods.json',
  npsAllPeriodsAudit: '/data/quality/nps_all_periods_audit.json',
  npsMechanismsAtResponse: '/data/processed/nps_mechanisms_at_response.json',
  vocAllPeriods: '/data/processed/voc_all_periods.json',
  npsPredictionNextCycle: '/data/processed/nps_prediction_next_cycle.json',
  historico2ClientsEnriched: '/data/processed/historico2_clients_enriched.json',
  historico2MatchAudit: '/data/quality/historico2_entry_date_match_audit.json',
  npsMeasurementsBaseQv: '/data/processed/nps_measurements_baseqv.json',
  npsMeasurementsConsolidated: '/data/processed/nps_measurements_consolidated.json',
  pharusAppCustomerMatch: '/data/processed/pharus_app_customer_match.json',
  pharusAppMatchAudit: '/data/quality/pharus_app_match_audit.json',
};

function logStoreError(message, detail) {
  console.error(`[analytics-store] ${message}`, detail ?? '');
}

function withCacheBust(url, bust) {
  if (!bust) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}

async function fetchJson(url, { bust = false } = {}) {
  const fetchUrl = withCacheBust(url, bust);
  let res;
  try {
    res = await fetch(fetchUrl, { cache: 'no-store' });
  } catch (cause) {
    logStoreError(`Failed to load ${url}`, 'fetch blocked or network error');
    const err = new Error(`[analytics-store] Failed to load ${url} (network)`);
    err.code = 'FETCH_BLOCKED';
    err.url = url;
    err.cause = cause;
    throw err;
  }
  if (!res.ok) {
    logStoreError(`Failed to load ${url}`, `HTTP ${res.status}`);
    const err = new Error(`[analytics-store] Failed to load ${url} HTTP ${res.status}`);
    err.code = res.status === 404 ? 'DATASET_NOT_FOUND' : 'HTTP_ERROR';
    err.url = url;
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    logStoreError(`Invalid JSON ${url}`, parseErr.message);
    const err = new Error(`[analytics-store] Invalid JSON ${url}`);
    err.code = 'INVALID_JSON';
    err.url = url;
    err.cause = parseErr;
    throw err;
  }
}

async function fetchOperationalPlansDoc({ bust = false } = {}) {
  try {
    const url = withCacheBust('/api/actions?action=plans', bust);
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const doc = await res.json();
      if (doc?.entries) return doc;
    }
  } catch {
    logStoreError('Operational plans API unavailable', 'using static JSON');
  }
  return fetchJsonOptional(PATHS.actionPlans, { bust });
}

function computeSnapshotFingerprint(snapshot, historicalNpsEnrichedDoc) {
  const parts = [
    snapshot?.refresh_id,
    snapshot?.generated_at,
    snapshot?.data_cutoff,
    historicalNpsEnrichedDoc?.meta?.generated_at,
  ].filter(Boolean);
  return parts.length ? parts.join('|') : null;
}

function resolveDataUpdatedAt(snapshot, cycleSummaryDoc, historicalNpsEnrichedDoc) {
  const candidates = [
    snapshot?.generated_at,
    snapshot?.data_cutoff,
    cycleSummaryDoc?.cycles?.[0]?.data_cutoff,
    historicalNpsEnrichedDoc?.meta?.generated_at,
  ].filter(Boolean);
  if (!candidates.length) return null;
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (Date.parse(c) > Date.parse(best)) best = c;
  }
  return best;
}

function notifyDataRefresh(detail) {
  for (const fn of dataRefreshListeners) {
    try {
      fn(detail);
    } catch (err) {
      logStoreError('data refresh listener', err);
    }
  }
}

export function getDataFreshness() {
  return { ...dataFreshness };
}

export function getAnalyticsDataSource() {
  return dataFreshness.dataSource;
}

export function getDashboardServerConfigSnapshot() {
  return dashboardServerConfig;
}

async function fetchDashboardServerConfig() {
  try {
    return await apiFetch('/api/dashboard?action=config');
  } catch {
    /* static-only deploy ou HTML/404 */
  }
  return null;
}

function executiveKpisForDiagnostics(cycleCode) {
  if (!cycleCode || !state) return {};
  const summary = buildExecutiveCurrentNpsSummary(
    state.responses ?? [],
    getCycleSummaryFromMap(summaryMap, cycleCode) ?? {},
    (state.cycles ?? []).find((c) => c.cycle_code === cycleCode) ?? {},
  );
  return {
    validResponses: summary?.valid_responses ?? null,
    nps: summary?.nps ?? null,
    averageScore: summary?.average_score ?? null,
    latestResponse: summary?.latest_nps_response_at ?? null,
  };
}

export function isAnalyticsRefreshInProgress() {
  return refreshInProgress;
}

export function subscribeDataRefresh(listener) {
  dataRefreshListeners.add(listener);
  return () => dataRefreshListeners.delete(listener);
}

async function fetchJsonOptional(url, { bust = false } = {}) {
  const fetchUrl = withCacheBust(url, bust);
  let res;
  try {
    res = await fetch(fetchUrl, { cache: 'no-store' });
  } catch {
    logStoreError(`Optional load failed ${url}`, 'network');
    return null;
  }
  if (!res.ok) {
    logStoreError(`Optional load ${url}`, `HTTP ${res.status}`);
    return null;
  }
  try {
    return await res.json();
  } catch {
    logStoreError(`Optional invalid JSON ${url}`, '');
    return null;
  }
}

async function fetchAllAnalyticsDatasets({ bust = false } = {}) {
  const fetchOpts = { bust };
  return Promise.all([
    fetchJson(PATHS.cycles, fetchOpts),
    fetchJson(PATHS.responses, fetchOpts),
    fetchJson(PATHS.cycleSummary, fetchOpts),
    fetchJson(PATHS.paired, fetchOpts),
    fetchJson(PATHS.migration, fetchOpts),
    fetchJson(PATHS.eligible, fetchOpts),
    fetchJson(PATHS.actionQueue, fetchOpts),
    fetchJson(PATHS.quality, fetchOpts),
    fetchJson(PATHS.snapshot, fetchOpts),
    fetchJsonOptional(PATHS.epSummary, fetchOpts),
    fetchJsonOptional(PATHS.responseTopics, fetchOpts),
    fetchJsonOptional(PATHS.topicSummary, fetchOpts),
    fetchJsonOptional(PATHS.csatSummary, fetchOpts),
    fetchJsonOptional(PATHS.clientSatisfaction, fetchOpts),
    fetchJsonOptional(PATHS.driversSummary, fetchOpts),
    fetchJsonOptional(PATHS.driverTests, fetchOpts),
    fetchJsonOptional(PATHS.commentDrivers, fetchOpts),
    fetchJsonOptional(PATHS.actionQueueEnriched, fetchOpts),
    fetchJsonOptional(PATHS.actionTracking, fetchOpts),
    fetchOperationalPlansDoc(fetchOpts),
    fetchJsonOptional(PATHS.executiveDiagnosis, fetchOpts),
    fetchJsonOptional(PATHS.populationAudit, fetchOpts),
    fetchJsonOptional(PATHS.npsClientMilestones, fetchOpts),
    fetchJsonOptional(PATHS.npsMilestonesSummary, fetchOpts),
    fetchJsonOptional(PATHS.npsBetweenCycleEvents, fetchOpts),
    fetchJsonOptional(PATHS.npsMilestonesQa, fetchOpts),
    fetchJsonOptional(PATHS.npsChangeDrivers, fetchOpts),
    fetchJsonOptional(PATHS.npsFinancialProfile, fetchOpts),
    fetchJsonOptional(PATHS.npsManagementInsights, fetchOpts),
    fetchJsonOptional(PATHS.customerNpsCohorts, fetchOpts),
    fetchJsonOptional(PATHS.customerNpsHistory, fetchOpts),
    fetchJsonOptional(PATHS.safrasCoberturaSummaries, fetchOpts),
    fetchJsonOptional(PATHS.safrasCoberturaAudit, fetchOpts),
    fetchJsonOptional(PATHS.historicalNpsSummary, fetchOpts),
    fetchJsonOptional(PATHS.historicalNpsResponses, fetchOpts),
    fetchJsonOptional(PATHS.historicalNpsClients, fetchOpts),
    fetchJsonOptional(PATHS.historicalNpsFieldCoverage, fetchOpts),
    fetchJsonOptional(PATHS.historicalNpsEnriched, fetchOpts),
    fetchJsonOptional(PATHS.historicalNpsEnrichedQuality, fetchOpts),
    fetchJsonOptional(PATHS.cohortPaymentDateAudit, fetchOpts),
    fetchJsonOptional(PATHS.npsAllPeriods, fetchOpts),
    fetchJsonOptional(PATHS.npsMechanismsAtResponse, fetchOpts),
    fetchJsonOptional(PATHS.vocAllPeriods, fetchOpts),
    fetchJsonOptional(PATHS.npsPredictionNextCycle, fetchOpts),
    fetchJsonOptional(PATHS.historico2ClientsEnriched, fetchOpts),
    fetchJsonOptional(PATHS.historico2MatchAudit, fetchOpts),
    fetchJsonOptional(PATHS.npsMeasurementsBaseQv, fetchOpts),
    fetchJsonOptional(PATHS.npsMeasurementsConsolidated, fetchOpts),
    fetchJsonOptional(PATHS.pharusAppCustomerMatch, fetchOpts),
    fetchJsonOptional(PATHS.pharusAppMatchAudit, fetchOpts),
  ]);
}

function applyAnalyticsPayload(datasets) {
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
    actionPlansDoc,
    executiveDiagnosisDoc,
    populationAuditDoc,
    npsClientMilestonesDoc,
    npsMilestonesSummaryDoc,
    npsBetweenCycleEventsDoc,
    npsMilestonesQaDoc,
    npsChangeDriversDoc,
    npsFinancialProfileDoc,
    npsManagementInsightsDoc,
    customerNpsCohortsDoc,
    customerNpsHistoryDoc,
    safrasCoberturaSummariesDoc,
    safrasCoberturaAuditDoc,
    historicalNpsSummaryDoc,
    historicalNpsResponsesDoc,
    historicalNpsClientsDoc,
    historicalNpsFieldCoverageDoc,
    historicalNpsEnrichedDoc,
    historicalNpsEnrichedQualityDoc,
    cohortPaymentDateAuditDoc,
    npsAllPeriodsDoc,
    npsMechanismsAtResponseDoc,
    vocAllPeriodsDoc,
    npsPredictionNextCycleDoc,
    historico2ClientsEnrichedDoc,
    historico2MatchAuditDoc,
    npsMeasurementsBaseQvDoc,
    npsMeasurementsConsolidatedDoc,
    pharusAppCustomerMatchDoc,
    pharusAppMatchAuditDoc,
  ] = datasets;

  const actionQueueEnrichedBase = actionQueueEnrichedDoc?.entries ?? [];
  const trackingNormalized = actionTrackingDoc ?? { entries: [] };
  const plansNormalized = actionPlansDoc ?? { entries: [] };
  let enrichedMerged = mergeActionTrackingIntoQueue(actionQueueEnrichedBase, trackingNormalized);
  enrichedMerged = mergeActionPlansIntoQueue(enrichedMerged, plansNormalized);

  if (!Array.isArray(responses)) {
    logStoreError('responses.json shape', `expected array, got ${typeof responses}`);
  }
  state = {
    cycles,
    responses: Array.isArray(responses) ? responses : [],
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
    actionPlansDoc: plansNormalized,
    executiveDiagnosisDoc: executiveDiagnosisDoc ?? null,
    populationAuditDoc: populationAuditDoc ?? null,
    npsClientMilestonesDoc: npsClientMilestonesDoc ?? null,
    npsMilestonesSummaryDoc: npsMilestonesSummaryDoc ?? null,
    npsBetweenCycleEventsDoc: npsBetweenCycleEventsDoc ?? null,
    npsMilestonesQaDoc: npsMilestonesQaDoc ?? null,
    npsChangeDriversDoc: npsChangeDriversDoc ?? null,
    npsFinancialProfileDoc: npsFinancialProfileDoc ?? null,
    npsManagementInsightsDoc: npsManagementInsightsDoc ?? null,
    customerNpsCohortsDoc: Array.isArray(customerNpsCohortsDoc) ? customerNpsCohortsDoc : [],
    customerNpsHistoryDoc: Array.isArray(customerNpsHistoryDoc) ? customerNpsHistoryDoc : [],
    safrasCoberturaSummariesDoc: safrasCoberturaSummariesDoc ?? null,
    safrasCoberturaAuditDoc: safrasCoberturaAuditDoc ?? null,
    historicalNpsSummaryDoc: historicalNpsSummaryDoc ?? null,
    historicalNpsResponsesDoc: historicalNpsResponsesDoc ?? null,
    historicalNpsClientsDoc: historicalNpsClientsDoc ?? null,
    historicalNpsFieldCoverageDoc: historicalNpsFieldCoverageDoc ?? null,
    historicalNpsEnrichedDoc: historicalNpsEnrichedDoc ?? null,
    historicalNpsEnrichedQualityDoc: historicalNpsEnrichedQualityDoc ?? null,
    cohortPaymentDateAuditDoc: cohortPaymentDateAuditDoc ?? null,
    npsAllPeriodsDoc: npsAllPeriodsDoc ?? null,
    npsMechanismsAtResponseDoc: npsMechanismsAtResponseDoc ?? null,
    vocAllPeriodsDoc: vocAllPeriodsDoc ?? null,
    npsPredictionNextCycleDoc: npsPredictionNextCycleDoc ?? null,
    historico2ClientsEnrichedDoc: historico2ClientsEnrichedDoc ?? null,
    historico2MatchAuditDoc: historico2MatchAuditDoc ?? null,
    npsMeasurementsBaseQvDoc: npsMeasurementsBaseQvDoc ?? null,
    npsMeasurementsConsolidatedDoc: npsMeasurementsConsolidatedDoc ?? null,
    pharusAppCustomerMatchDoc: pharusAppCustomerMatchDoc ?? null,
    pharusAppMatchAuditDoc: pharusAppMatchAuditDoc ?? null,
    dataCutoff: cycleSummaryDoc?.data_cutoff ?? snapshot?.at ?? null,
  };
  summaryMap = buildSummaryMap(cycleSummaryDoc);
  dataFreshness.dataUpdatedAt = resolveDataUpdatedAt(
    snapshot,
    cycleSummaryDoc,
    historicalNpsEnrichedDoc,
  );
  dataFreshness.snapshotFingerprint = computeSnapshotFingerprint(
    snapshot,
    historicalNpsEnrichedDoc,
  );
  return state;
}

export async function loadAnalyticsData() {
  const datasets = await fetchAllAnalyticsDatasets({ bust: false });
  dataFreshness.lastCheckedAt = new Date().toISOString();
  return applyAnalyticsPayload(datasets);
}

/** Boot: apenas snapshot local (não bloqueia em BASE QV). */
export async function bootstrapAnalyticsStaticShell() {
  dashboardServerConfig = await fetchDashboardServerConfig();
  await loadAnalyticsData();
  dataFreshness.dataSource = 'static';
  const cycleCode = getLatestCycleBySequence(state?.cycles ?? [])?.cycle_code;
  const staticKpis = executiveKpisForDiagnostics(cycleCode);
  logDashboardRefreshDiagnostics({ source: 'static-fallback', ...staticKpis });
  return state;
}

/** Dispara refresh BASE QV em background (não await no boot). */
export function startBackgroundAnalyticsRefresh() {
  return refreshAnalyticsData({ force: true, mode: 'light', background: true });
}

/** @deprecated use bootstrapAnalyticsStaticShell + startBackgroundAnalyticsRefresh */
export async function bootstrapAnalyticsData() {
  await bootstrapAnalyticsStaticShell();
  return startBackgroundAnalyticsRefresh();
}

/**
 * Recarrega datasets (cache bust opcional). Não altera filtros/rota.
 * @returns {Promise<{ status: 'changed' | 'unchanged' | 'failed' | 'skipped', changed?: boolean }>}
 */
async function fetchWithTimeout(url, timeoutMs = RUNTIME_REFRESH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal });
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      const err = new Error('[analytics-store] Runtime refresh timeout');
      err.code = 'RUNTIME_TIMEOUT';
      throw err;
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRuntimeDashboardRefresh(force, mode = 'light') {
  const path =
    mode === 'full' ? '/api/dashboard?action=refresh' : '/api/dashboard?action=current-nps';
  const url = `${path}&force=${force ? '1' : '0'}`;
  let res;
  try {
    res = await fetchWithTimeout(url);
  } catch (cause) {
    const err = new Error('[analytics-store] Runtime refresh network error');
    err.code = 'RUNTIME_FETCH_BLOCKED';
    err.cause = cause;
    throw err;
  }
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!contentType.includes('json') && text.trimStart().startsWith('<')) {
    const err = new Error('[analytics-store] Runtime refresh returned HTML (rota /api ausente?)');
    err.code = 'RUNTIME_INVALID_JSON';
    err.status = res.status;
    throw err;
  }
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    const err = new Error('[analytics-store] Runtime refresh invalid JSON');
    err.code = 'RUNTIME_INVALID_JSON';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(json.message ?? `Runtime refresh HTTP ${res.status}`);
    err.code = json.code ?? 'RUNTIME_HTTP_ERROR';
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function mergeLightCurrentNpsPayload(light) {
  if (!state || !light?.ok) return false;
  const mergeResult = applyLightCurrentNpsPayload(state, light);
  if (!mergeResult.applied) return false;
  summaryMap = mergeResult.summaryMap;
  dataFreshness.dataSource = 'runtime';
  dataFreshness.runtimeErrorCode = null;
  dataFreshness.runtimeRefreshMode = 'light';
  if (light.refreshed_at) {
    dataFreshness.dataUpdatedAt = light.refreshed_at;
  }
  if (light.fingerprint) dataFreshness.runtimeFingerprint = light.fingerprint;
  return true;
}

function mergeRuntimeRefreshPayload(runtime) {
  if (!state || !runtime?.datasets) return false;
  const mergeResult = applyRuntimeRefreshPayload(state, runtime, {
    buildClientSatMap,
    refreshActionQueueEnrichedEntries,
  });
  if (!mergeResult.applied) return false;
  summaryMap = mergeResult.summaryMap;
  dataFreshness.dataSource = 'runtime';
  dataFreshness.runtimeErrorCode = null;
  dataFreshness.runtimeRefreshMode = 'full';
  if (runtime.refreshed_at) {
    dataFreshness.dataUpdatedAt = runtime.refreshed_at;
  } else if (runtime.source_max_updated_at) {
    dataFreshness.dataUpdatedAt = runtime.source_max_updated_at;
  } else if (runtime.datasets?.snapshot?.generated_at) {
    dataFreshness.dataUpdatedAt = runtime.datasets.snapshot.generated_at;
  }
  if (runtime.fingerprint) dataFreshness.runtimeFingerprint = runtime.fingerprint;
  return true;
}

export async function refreshAnalyticsData({ force = false, mode = 'light', background = false } = {}) {
  if (refreshInProgress) return { status: 'skipped', reason: 'in_progress' };
  refreshInProgress = true;
  const prevFingerprint =
    dataFreshness.runtimeFingerprint ?? dataFreshness.snapshotFingerprint;
  try {
    const runtime = await fetchRuntimeDashboardRefresh(force, mode);
    const merged =
      mode === 'full'
        ? mergeRuntimeRefreshPayload(runtime)
        : mergeLightCurrentNpsPayload(runtime);
    if (!merged) {
      throw new Error('[analytics-store] Runtime refresh sem datasets aplicáveis');
    }
    if (mode === 'full') {
      const plansDoc = await fetchOperationalPlansDoc({ bust: force });
      if (plansDoc?.entries) {
        state.actionPlansDoc = plansDoc;
        refreshActionQueueEnrichedEntries();
      }
    }
    dataFreshness.lastCheckedAt = new Date().toISOString();
    const nextFp = runtime.fingerprint ?? dataFreshness.runtimeFingerprint;
    const changed =
      prevFingerprint == null
        ? Boolean(nextFp)
        : nextFp != null && prevFingerprint !== nextFp;
    const status = changed ? 'changed' : 'unchanged';
    const cycleCode = getLatestCycleBySequence(state?.cycles ?? [])?.cycle_code;
    const kpis = runtime.executive_current_kpis ?? executiveKpisForDiagnostics(cycleCode);
    logDashboardRefreshDiagnostics({
      source: 'runtime',
      validResponses: kpis.valid_responses ?? kpis.validResponses ?? null,
      nps: kpis.nps ?? null,
      averageScore: kpis.average_score ?? kpis.averageScore ?? null,
      latestResponse: kpis.latest_nps_response_at ?? kpis.latestResponse ?? null,
    });
    notifyDataRefresh({
      status,
      changed,
      force,
      runtime: true,
      dataSource: 'runtime',
      mode,
      background,
    });
    return {
      status,
      changed: Boolean(changed),
      stats: runtime.stats ?? null,
      dataSource: 'runtime',
      mode,
      durationMs: runtime.duration_ms ?? null,
      executiveKpis: runtime.executive_current_kpis ?? null,
    };
  } catch (error) {
    dataFreshness.lastCheckedAt = new Date().toISOString();
    dataFreshness.runtimeErrorCode = error.code ?? 'REFRESH_FAILED';
    logDashboardRefreshDiagnostics({
      source: 'static-fallback',
      errorCode: dataFreshness.runtimeErrorCode,
      httpStatus: error.status ?? null,
    });
    notifyDataRefresh({
      status: 'failed',
      error,
      force,
      dataSource: dataFreshness.dataSource,
      mode,
      background,
    });
    if (!background && dashboardServerConfig?.require_runtime_refresh) {
      error.code = error.code ?? 'RUNTIME_REQUIRED_FAILED';
      throw error;
    }
    return { status: 'failed', error, background };
  } finally {
    refreshInProgress = false;
  }
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

/** NPS atual — kernel ao vivo (mesma regra que executive_diagnosis regenerado). */
export function getExecutiveOfficialSummary(cycleCode) {
  const template = getCycleSummary(cycleCode);
  if (!template || !state) return template;
  const cycleDef = (state.cycles ?? []).find((c) => c.cycle_code === cycleCode) ?? {};
  const live = buildExecutiveCurrentNpsSummary(state.responses ?? [], template, cycleDef);
  return {
    ...live,
    eligible_clients: template.eligible_clients ?? live.eligible_clients,
    response_rate: template.response_rate ?? live.response_rate,
    latest_nps_response_at: live.latest_nps_response_at ?? template.latest_nps_response_at,
  };
}

/**
 * NPS atual oficial (BASE QV runtime) — mesma regra para Executivo e Projeção.
 * Enquanto o refresh não conclui, status `loading` (não usar snapshot estático como NPS atual).
 */
export function getCurrentOfficialNpsState(cycleCode) {
  const source = dataFreshness.dataSource;
  const awaitingRuntime =
    refreshInProgress || (source === 'static' && dataFreshness.runtimeErrorCode == null);

  if (awaitingRuntime) {
    return { status: 'loading', summary: null, usingCache: source === 'static' };
  }
  if (source !== 'runtime') {
    return {
      status: 'unavailable',
      summary: null,
      usingCache: true,
      errorCode: dataFreshness.runtimeErrorCode ?? 'RUNTIME_UNAVAILABLE',
    };
  }
  const summary = getExecutiveOfficialSummary(cycleCode);
  const nps = summary?.nps;
  if (nps == null || Number.isNaN(Number(nps))) {
    return { status: 'unavailable', summary: null, usingCache: false };
  }
  return { status: 'ready', summary, usingCache: false };
}

/** Resumo oficial quando runtime BASE QV está pronto; caso contrário `null`. */
export function getCurrentOfficialNps(cycleCode) {
  const official = getCurrentOfficialNpsState(cycleCode);
  return official.status === 'ready' ? official.summary : null;
}

export function getExecutivePreviousOfficialSummary(currentCycleCode) {
  const prevDef = getPreviousCycle(currentCycleCode);
  if (!prevDef?.cycle_code) return null;
  const template = getCycleSummary(prevDef.cycle_code);
  return buildExecutivePreviousNpsSummary(state?.responses ?? [], prevDef, template ?? {});
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

/** Substitui temas publicados de uma resposta (ex.: após revisão manual). */
export function replaceResponseTopicRows(responseId, newRows) {
  if (!state?.responseTopics || !responseId) return;
  state.responseTopics = state.responseTopics.filter((t) => t.response_id !== responseId).concat(newRows);
}

export function getVocClassificationMeta() {
  return state?.topicSummaryDoc?.classification ?? null;
}

export function getTopicFilterOptions(cycleCode) {
  return getTopicOptions(state?.responseTopics ?? [], cycleCode);
}

export function getVocCommentTableRows(cycleCode, filters) {
  return buildVocGroupedCommentRows(
    state?.responses ?? [],
    state?.responseTopics ?? [],
    cycleCode,
    filters,
  );
}

export function getSortedTopicSummaries(cycleCode, sortKey, dir) {
  return sortTopicSummaries(getTopicSummary(cycleCode), sortKey, dir);
}

export function getVocPageKpis(cycleCode, filters = null) {
  const f = filters ?? {};
  return computeVocPageKpisForFilters(
    state?.responses ?? [],
    state?.responseTopics ?? [],
    cycleCode,
    f,
  );
}

export function getGlobalFilterContext(cycleCode, filters) {
  if (!state) return null;
  const prevCode = getPreviousCycleCode(state.cycles ?? [], cycleCode);
  return buildGlobalFilterContext({
    cycleCode,
    filters,
    responses: state.responses ?? [],
    cycles: state.cycles ?? [],
    pairedDoc: state.pairedCycles,
    migrationDoc: state.migrationMatrix,
    actionQueue: state.actionQueue ?? [],
    clientSatMap: state.clientSatMap,
    officialSummary: getExecutiveOfficialSummary(cycleCode),
    previousOfficialSummary: prevCode ? getExecutivePreviousOfficialSummary(cycleCode) : null,
    npsAllPeriods: state.npsAllPeriodsDoc?.responses ?? [],
  });
}

export function getNpsAllPeriodsDoc() {
  return state?.npsAllPeriodsDoc ?? null;
}

export function getNpsAllPeriodsResponses() {
  return state?.npsAllPeriodsDoc?.responses ?? [];
}

export function getNpsMechanismsAtResponse() {
  return state?.npsMechanismsAtResponseDoc?.entries ?? [];
}

export function getVocAllPeriodsTopics() {
  return state?.vocAllPeriodsDoc?.topics ?? null;
}

export function hasVocAllPeriods() {
  return (state?.vocAllPeriodsDoc?.topics?.length ?? 0) > 0;
}

/** VoC unificado (atual + BASE0 deduplicado) respeitando filtro Período NPS. */
export function getVocTopicsForFilters(cycleCode, filters = {}) {
  const period = filters.npsPeriod ?? 'all';
  const merged = state?.vocAllPeriodsDoc?.topics ?? [];
  if (!merged.length || period === 'current') {
    return getResponseTopicsForCycle(state?.responseTopics ?? [], cycleCode);
  }
  if (period === 'all') return merged;
  if (period === 'base0') return merged.filter((t) => t.source === 'base0');
  return merged.filter(
    (t) => t.analytical_cycle_code === period || t.cycle === period || t.onda === period,
  );
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
  const rows = getActionQueueEnrichedForCycle(state?.actionQueueEnrichedDoc, cycleCode);
  const cycleResponses = getResponsesForCycle(state?.responses ?? [], cycleCode);
  const byResponseId = new Map(cycleResponses.map((r) => [r.response_id, r]));
  return rows.map((row) => {
    const resp = byResponseId.get(row.response_id) ?? null;
    const program = resp?.program ?? row.program ?? row.program_name ?? null;
    return {
      ...row,
      program,
      program_name: program ?? row.program_name,
    };
  });
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

export function getPopulationAudit() {
  return state?.populationAuditDoc ?? null;
}

export function hasNpsMilestones() {
  return Array.isArray(state?.npsClientMilestonesDoc?.entries);
}

export function getNpsClientMilestones() {
  return state?.npsClientMilestonesDoc?.entries ?? [];
}

export function getNpsMilestonesSummary() {
  return state?.npsMilestonesSummaryDoc ?? null;
}

export function getNpsBetweenCycleEvents() {
  return state?.npsBetweenCycleEventsDoc?.entries ?? [];
}

export function getNpsMilestonesQa() {
  return state?.npsMilestonesQaDoc ?? null;
}

export function hasNpsChangeDrivers() {
  return state?.npsChangeDriversDoc?.meta?.current_cycle != null;
}

export function getNpsChangeDrivers() {
  return state?.npsChangeDriversDoc ?? null;
}

export function hasNpsFinancialProfile() {
  return (state?.npsFinancialProfileDoc?.entries?.length ?? 0) > 0;
}

export function getNpsFinancialProfile() {
  return state?.npsFinancialProfileDoc ?? null;
}

export function hasNpsManagementInsights() {
  return (state?.npsManagementInsightsDoc?.insights?.length ?? 0) > 0;
}

export function getNpsManagementInsights() {
  return state?.npsManagementInsightsDoc ?? null;
}

export function hasSafrasCobertura() {
  return (state?.customerNpsCohortsDoc?.length ?? 0) > 0;
}

export function getCustomerNpsCohorts() {
  return state?.customerNpsCohortsDoc ?? [];
}

export function getCustomerNpsHistory() {
  return state?.customerNpsHistoryDoc ?? [];
}

export function getSafrasCoberturaSummaries() {
  return state?.safrasCoberturaSummariesDoc ?? null;
}

export function getSafrasCoberturaAudit() {
  return state?.safrasCoberturaAuditDoc ?? null;
}

export function getPharusAppCustomerMatch() {
  return state?.pharusAppCustomerMatchDoc ?? null;
}

export function getPharusAppMatchAudit() {
  return state?.pharusAppMatchAuditDoc ?? null;
}

export function getHistoricalNpsSummary() {
  return state?.historicalNpsSummaryDoc ?? null;
}

export function getHistoricalNpsResponses() {
  return state?.historicalNpsResponsesDoc ?? null;
}

export function getHistoricalNpsClients() {
  return state?.historicalNpsClientsDoc ?? null;
}

export function getHistoricalNpsFieldCoverage() {
  return state?.historicalNpsFieldCoverageDoc ?? null;
}

export function getHistoricalNpsEnriched() {
  return state?.historicalNpsEnrichedDoc ?? null;
}

export function getHistoricalNpsEnrichedQuality() {
  return state?.historicalNpsEnrichedQualityDoc ?? null;
}

export function getCohortPaymentDateAudit() {
  return state?.cohortPaymentDateAuditDoc ?? null;
}

export function getNpsPredictionDoc() {
  return state?.npsPredictionNextCycleDoc ?? null;
}

export function getHistorico2Doc() {
  return state?.historico2ClientsEnrichedDoc ?? null;
}

export function getHistorico2MatchAudit() {
  return state?.historico2MatchAuditDoc ?? null;
}

export function getNpsMeasurementsBaseQvDoc() {
  return state?.npsMeasurementsBaseQvDoc ?? null;
}

export function getNpsMeasurementsConsolidatedDoc() {
  return state?.npsMeasurementsConsolidatedDoc ?? null;
}

function refreshActionQueueEnrichedEntries() {
  if (!state?.actionQueueEnrichedBase) return;
  let entries = mergeActionTrackingIntoQueue(state.actionQueueEnrichedBase, state.actionTrackingDoc);
  entries = mergeActionPlansIntoQueue(entries, state.actionPlansDoc);
  state.actionQueueEnrichedDoc = {
    ...state.actionQueueEnrichedDoc,
    entries,
  };
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
  refreshActionQueueEnrichedEntries();
}

export function patchLocalActionPlanEntry(entry) {
  if (!entry?.client_id) return;
  const doc = { entries: [...(state.actionPlansDoc?.entries ?? [])] };
  const key = `${entry.client_id}||${entry.response_id ?? ''}||${entry.cycle_code ?? ''}`;
  const idx = doc.entries.findIndex(
    (e) => `${e.client_id}||${e.response_id ?? ''}||${e.cycle_code ?? ''}` === key,
  );
  if (idx >= 0) doc.entries[idx] = { ...doc.entries[idx], ...entry };
  else doc.entries.push(entry);
  doc.updated_at = new Date().toISOString();
  state.actionPlansDoc = doc;
  refreshActionQueueEnrichedEntries();
}

export function getResponseById(responseId) {
  if (!responseId || !state?.responses) return null;
  return state.responses.find((r) => r.response_id === responseId) ?? null;
}

export { getPreviousCycleCode, buildSummaryMap };
