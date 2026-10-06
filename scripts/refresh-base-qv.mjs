#!/usr/bin/env node
/**
 * Refresh operacional BASE QV (SELECT via REST) + sync ingest/partials.
 * Não escreve no Supabase BASE QV.
 */
import { refreshNps } from './refresh-nps.mjs';
import { syncPartialsFromRawSnapshot } from '../lib/ingest/sync-partials-from-raw.mjs';
import { confirmBaseQvReadOnly } from '../lib/data/base-qv.mjs';

async function main() {
  confirmBaseQvReadOnly();
  delete process.env.ANALYTICS_INGEST_SNAPSHOT;

  const result = await refreshNps();
  const snapshotId = result.runRecord?.raw_snapshot ?? result.stats?.raw_snapshot;
  if (!snapshotId) throw new Error('Refresh não retornou raw_snapshot');

  const sync = await syncPartialsFromRawSnapshot(snapshotId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        refresh_run_id: result.refreshRunId,
        snapshot_id: snapshotId,
        status: result.runRecord?.status,
        source_counts: result.runRecord?.source_counts,
        sync,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: e.message }, null, 2));
  process.exit(1);
});
