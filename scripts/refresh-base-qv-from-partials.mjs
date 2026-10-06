#!/usr/bin/env node
/**
 * Refresh operacional quando REST BASE QV não está disponível (ex.: JWT anon).
 * Fonte: data/ingest/partials (export SELECT via MCP/SQL, read-only no BASE QV).
 * Reutiliza assemble-ingest-snapshot + runFileRefresh oficial.
 */
import { assembleIngestSnapshot } from './assemble-ingest-snapshot.mjs';
import { refreshNps } from './refresh-nps.mjs';
import { syncPartialsFromRawSnapshot } from '../lib/ingest/sync-partials-from-raw.mjs';
import { confirmBaseQvReadOnly } from '../lib/data/base-qv.mjs';
import { formatRawSnapshotDir } from '../lib/data/file-store.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const partialsDir = join(__dirname, '../data/ingest/partials');

function partialStats() {
  const read = (n) => JSON.parse(readFileSync(join(partialsDir, n), 'utf8'));
  const r1 = read('nps_responses_1.json');
  const r2 = read('nps_responses_2.json');
  const clients = read('clients.json');
  let maxUpdated = null;
  let maxSubmitted = null;
  for (const c of clients) {
    const u = c.updated_at;
    if (u && (!maxUpdated || u > maxUpdated)) maxUpdated = u;
  }
  for (const r of [...r1, ...r2]) {
    const s = r.submitted_at;
    if (s && (!maxSubmitted || s > maxSubmitted)) maxSubmitted = s;
  }
  return {
    clients_count: clients.length,
    nps_responses_count: r1.length + r2.length,
    nps_cycles_count: read('nps_cycles.json').length,
    nps_sends_count: read('nps_sends.json').length,
    max_clients_updated_at: maxUpdated,
    max_nps_submitted_at: maxSubmitted,
  };
}

async function main() {
  confirmBaseQvReadOnly();
  if (process.env.ANALYTICS_ALLOW_BASELINE_DRIFT !== '1') {
    process.env.ANALYTICS_ALLOW_BASELINE_DRIFT = '1';
  }
  if (process.env.VOC_USE_GEMINI !== '0') {
    process.env.VOC_USE_GEMINI = '0';
  }
  const snapshotId = process.argv[2] ?? formatRawSnapshotDir(new Date());
  const statsBefore = partialStats();

  await assembleIngestSnapshot(snapshotId);

  process.env.ANALYTICS_INGEST_SNAPSHOT = snapshotId;
  const result = await refreshNps({ ingestSnapshotId: snapshotId });
  delete process.env.ANALYTICS_INGEST_SNAPSHOT;

  const rawSnapshot = result.runRecord?.raw_snapshot ?? snapshotId;
  const sync = await syncPartialsFromRawSnapshot(rawSnapshot);

  mkdirSync(partialsDir, { recursive: true });
  writeFileSync(
    join(partialsDir, 'manifest.json'),
    `${JSON.stringify(
      {
        refresh_at: new Date().toISOString(),
        ingest_source: 'BASE_QV_MCP_SQL_EXPORT',
        snapshot_id: rawSnapshot,
        source_project_ref: 'lacinxsvjdwalkchxyeo',
        ...partialStats(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        path: 'MCP/partials → assemble → runFileRefresh(ingest)',
        snapshot_id: rawSnapshot,
        partial_stats: statsBefore,
        refresh_run_id: result.refreshRunId,
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
