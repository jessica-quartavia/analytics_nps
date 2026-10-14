import { randomUUID } from 'node:crypto';
import { createBaseQvClient } from '../data/base-qv.mjs';
import {
  fetchNpsCycles,
  fetchNpsResponsesInWindow,
  fetchNpsSendsForCycleId,
  fetchClientsByIds,
} from '../data/base-qv.mjs';
import { loadAnalyticalCycleConfig, resolveCycleBounds } from '../analytics/analytical-cycles.mjs';
import {
  aggregateNpsForOfficialSourceCycleWindow,
  classifyNpsScore,
  matchesOfficialSourceCycleWindow,
} from '../analytics/nps.mjs';
import { createDashboardRefreshLogger } from './dashboard-refresh-log.mjs';

const CURRENT_ACTION_CYCLE = 'NPS-2026-SET-PHARUS';

function buildWindowResponseRows(sourceRows, clientsMap, setDef, bounds) {
  const rows = [];
  for (const src of sourceRows) {
    const client = src.client_id ? clientsMap.get(src.client_id) : null;
    const program = client?.programa ?? null;
    const score = src.score;
    if (score == null || score < 0 || score > 10) continue;
    const row = {
      response_id: src.id,
      source_response_id: src.id,
      typeform_response_id: src.typeform_response_id ?? null,
      client_id: src.client_id,
      client_code: client?.codigo ?? null,
      client_name: src.client_name ?? client?.name ?? null,
      analytical_cycle_code: setDef?.cycle_code ?? CURRENT_ACTION_CYCLE,
      analytical_cycle_name: setDef?.cycle_name ?? 'Set/2026',
      submitted_at: src.submitted_at,
      score,
      nps_category: classifyNpsScore(score),
      tipo_de_forms: src.tipo_de_forms ?? 'NPS',
      program,
      source: 'BASE_QV',
    };
    if (!matchesOfficialSourceCycleWindow(row, bounds)) continue;
    rows.push(row);
  }
  return rows;
}

/**
 * Refresh leve: janela T3 + KPIs executivos (sem pipeline completo).
 */
export async function runRuntimeCurrentNpsRefresh() {
  const log = createDashboardRefreshLogger('dashboard-refresh');
  log.info('START mode=light');

  const tCycles = log.start('fetch cycles');
  const baseQv = createBaseQvClient();
  const sourceCycles = await fetchNpsCycles(baseQv);
  log.end('fetch cycles', tCycles, `rows=${sourceCycles.length}`);

  const analyticalConfig = loadAnalyticalCycleConfig();
  const setDef = analyticalConfig.find((c) => c.cycle_code === CURRENT_ACTION_CYCLE);
  if (!setDef) {
    throw new Error(`Config ausente: ${CURRENT_ACTION_CYCLE}`);
  }
  const bounds = resolveCycleBounds(setDef, sourceCycles);

  const tResp = log.start('fetch responses');
  const sourceRows = await fetchNpsResponsesInWindow(baseQv, bounds.starts_at, bounds.ends_at);
  log.end('fetch responses', tResp, `rows=${sourceRows.length}`);

  const tSends = log.start('fetch sends');
  const sourceCycleId = setDef.source_cycle_ids?.[0] ?? null;
  const sends = await fetchNpsSendsForCycleId(baseQv, sourceCycleId);
  log.end('fetch sends', tSends, `rows=${sends.length}`);

  const clientIds = [
    ...new Set([
      ...sourceRows.map((r) => r.client_id).filter(Boolean),
      ...sends.map((s) => s.client_id).filter(Boolean),
    ]),
  ];

  const tClients = log.start('fetch clients');
  const clientsMap = await fetchClientsByIds(baseQv, clientIds);
  log.end('fetch clients', tClients, `ids=${clientIds.length}`);

  const tBuild = log.start('build responses');
  const windowResponses = buildWindowResponseRows(sourceRows, clientsMap, setDef, bounds);
  log.end('build responses', tBuild, `rows=${windowResponses.length}`);

  const tAgg = log.start('executive');
  const agg = aggregateNpsForOfficialSourceCycleWindow(windowResponses, bounds);
  const sendsInCycle = sends.length;
  const eligibleClients = new Set(sends.map((s) => s.client_id).filter(Boolean)).size;
  const sendDenominator = sendsInCycle > 0 ? sendsInCycle : eligibleClients;
  const responseRate = sendDenominator > 0 ? (agg.responses ?? 0) / sendDenominator : null;
  log.end('executive', tAgg);

  const durationMs = log.done(`valid=${agg.responses}`);

  const refreshedAt = new Date().toISOString();
  const fingerprint = [
    agg.responses,
    agg.promoters,
    agg.detractors,
    agg.latest_nps_response_at,
  ]
    .filter((x) => x != null)
    .join('|');

  return {
    ok: true,
    mode: 'light',
    refreshed_at: refreshedAt,
    duration_ms: durationMs,
    fingerprint,
    window_bounds: bounds,
    latest_nps_response_at: agg.latest_nps_response_at,
    latest_nps_response_id: agg.latest_nps_response_id,
    latest_nps_score: agg.latest_nps_score,
    executive_current_kpis: {
      valid_responses: agg.responses,
      promoters: agg.promoters,
      neutrals: agg.neutrals,
      detractors: agg.detractors,
      nps: agg.nps,
      average_score: agg.average_score,
      latest_nps_response_at: agg.latest_nps_response_at,
      eligible_clients: sendDenominator,
      sends_in_cycle: sendsInCycle,
      response_rate: responseRate,
    },
    stats: {
      source_nps_responses_window: sourceRows.length,
      window_responses_built: windowResponses.length,
      sends_in_cycle: sendsInCycle,
      sends_distinct_clients: eligibleClients,
    },
    datasets: {
      window_responses: windowResponses,
      cycle_code: CURRENT_ACTION_CYCLE,
    },
    snapshot_id: randomUUID(),
  };
}
