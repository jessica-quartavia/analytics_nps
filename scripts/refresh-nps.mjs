import { runFileRefresh } from '../lib/pipeline/build-analytics.mjs';

export async function refreshNps(opts = {}) {
  const ingestSnapshotId = opts.ingestSnapshotId ?? process.env.ANALYTICS_INGEST_SNAPSHOT ?? null;
  return runFileRefresh({ ...opts, ingestSnapshotId });
}

if (process.argv[1]?.endsWith('refresh-nps.mjs')) {
  try {
    const result = await refreshNps();
    console.log(
      JSON.stringify(
        {
          ok: true,
          refresh_run_id: result.refreshRunId,
          stats: result.runRecord,
          cycle_summaries: result.cycleSummaries?.map((s) => ({
            cycle_code: s.cycle_code,
            valid_responses: s.valid_responses,
            nps: s.nps,
            nps_ci_low: s.nps_ci_low,
            nps_ci_high: s.nps_ci_high,
          })),
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(JSON.stringify({ ok: false, message: err.message, details: err.details ?? null }, null, 2));
    process.exit(1);
  }
}
