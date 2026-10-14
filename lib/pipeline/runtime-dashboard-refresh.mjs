import { runFileRefresh } from './build-analytics.mjs';

/** Inventário: datasets servidos pelo refresh runtime (BASE QV read-only). */
export const RUNTIME_REFRESH_DATASETS = [
  'responses',
  'cycles',
  'cycle_summary',
  'paired_cycles',
  'migration_matrix',
  'ep_summary',
  'executive_diagnosis',
  'action_queue_enriched',
  'response_topics',
  'topic_summary',
  'drivers_summary',
  'csat_summary',
  'snapshot',
];

let cache = {
  at: 0,
  fingerprint: null,
  payload: null,
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function runtimeFingerprint(bundle) {
  if (!bundle) return null;
  const cur = bundle.stats?.current_valid_responses;
  return [bundle.source_max_updated_at, bundle.stats?.source_nps_responses, cur, bundle.snapshot?.refresh_id]
    .filter((x) => x != null)
    .join('|');
}

/**
 * Recalcula artefatos principais a partir da BASE QV (sem escrever arquivos).
 * @param {{ force?: boolean, ttlMs?: number }} [opts]
 */
export async function runRuntimeDashboardRefresh(opts = {}) {
  const force = Boolean(opts.force);
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  if (!force && cache.payload && now - cache.at < ttlMs) {
    return { ...cache.payload, from_cache: true };
  }

  const prevDrift = process.env.ANALYTICS_ALLOW_BASELINE_DRIFT;
  process.env.ANALYTICS_ALLOW_BASELINE_DRIFT = '1';

  let pipelineResult;
  try {
    pipelineResult = await runFileRefresh({ writeFiles: false, runtime: true });
  } catch (err) {
    if (prevDrift === undefined) delete process.env.ANALYTICS_ALLOW_BASELINE_DRIFT;
    else process.env.ANALYTICS_ALLOW_BASELINE_DRIFT = prevDrift;
    throw err;
  }

  if (prevDrift === undefined) delete process.env.ANALYTICS_ALLOW_BASELINE_DRIFT;
  else process.env.ANALYTICS_ALLOW_BASELINE_DRIFT = prevDrift;

  const bundle = pipelineResult.runtimeBundle;
  const fp = runtimeFingerprint(bundle);
  const payload = {
    ok: pipelineResult.status === 'success' || Boolean(bundle),
    refreshed_at: new Date().toISOString(),
    source_max_updated_at: bundle?.source_max_updated_at ?? pipelineResult.sourceMaxUpdatedAt ?? null,
    snapshot_id: pipelineResult.refreshRunId,
    pipeline_status: pipelineResult.status,
    fingerprint: fp,
    datasets: {
      cycles: pipelineResult.cycles,
      responses: pipelineResult.responses,
      cycle_summary: bundle?.cycle_summary,
      paired_cycles: bundle?.paired_cycles,
      migration_matrix: bundle?.migration_matrix,
      ep_summary: bundle?.ep_summary,
      executive_diagnosis: bundle?.executive_diagnosis,
      action_queue_enriched: bundle?.action_queue_enriched,
      response_topics: bundle?.response_topics,
      topic_summary: bundle?.topic_summary,
      drivers_summary: bundle?.drivers_summary,
      driver_tests: bundle?.driver_tests,
      comment_drivers: bundle?.comment_drivers,
      csat_summary: bundle?.csat_summary,
      client_satisfaction_summary: bundle?.client_satisfaction_summary,
      action_queue: bundle?.action_queue,
      snapshot: bundle?.snapshot,
    },
    stats: bundle?.stats ?? null,
    latest_nps_response_at: bundle?.latest_nps_response_at ?? null,
    latest_nps_response_id: bundle?.latest_nps_response_id ?? null,
    latest_nps_score: bundle?.latest_nps_score ?? null,
    executive_current_kpis: bundle?.executive_current_kpis ?? null,
    from_cache: false,
  };

  cache = { at: now, fingerprint: fp, payload };
  return payload;
}

export function clearRuntimeDashboardRefreshCache() {
  cache = { at: 0, fingerprint: null, payload: null };
}
