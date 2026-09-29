#!/usr/bin/env node
/**
 * SELECT-only: exporta fontes temporais de marcos no snapshot raw existente.
 * Uso: node scripts/export-milestone-sources.mjs [snapshotId]
 */
import 'dotenv/config';
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import {
  confirmBaseQvReadOnly,
  createBaseQvClient,
} from '../lib/data/base-qv.mjs';
import {
  fetchMilestoneSourcesBundle,
  pharusMilestoneClientScope,
} from '../lib/data/fetch-milestone-sources.mjs';
import { buildMilestoneExportQaDoc } from '../lib/data/milestone-export-qa.mjs';

const snapshotId =
  process.argv[2] ??
  process.env.MILESTONES_RAW_SNAPSHOT ??
  (await readJson('snapshots/latest.json', null))?.raw_snapshot;

if (!snapshotId) {
  console.error('Informe snapshotId ou defina snapshots/latest.json');
  process.exit(1);
}

confirmBaseQvReadOnly();
const savedIngest = process.env.ANALYTICS_INGEST_SNAPSHOT;
delete process.env.ANALYTICS_INGEST_SNAPSHOT;
let baseQv;
try {
  baseQv = createBaseQvClient();
} finally {
  if (savedIngest) process.env.ANALYTICS_INGEST_SNAPSHOT = savedIngest;
}

const sourceRows = await readJson(`raw/${snapshotId}/nps_responses.json`, []);
const allSends = await readJson(`raw/${snapshotId}/nps_sends.json`, []);
const clientsList = await readJson(`raw/${snapshotId}/clients.json`, []);
const clientsMap = new Map((clientsList ?? []).map((c) => [c.id, c]));

const pharusScopeIds = pharusMilestoneClientScope(sourceRows, allSends, clientsMap);
const { files, errors } = await fetchMilestoneSourcesBundle(baseQv, pharusScopeIds);

const qa = buildMilestoneExportQaDoc(files);
qa.scope = {
  snapshot_id: snapshotId,
  pharus_client_ids: pharusScopeIds.length,
  note: 'Histórico exportado por client_id PHARUS (respostas + envios).',
};
if (Object.keys(errors).length) qa.fetch_errors = errors;

for (const [name, rows] of Object.entries(files)) {
  await writeJson(`raw/${snapshotId}/${name}`, rows);
}

await writeJson(`raw/${snapshotId}/milestone_sources_export_qa.json`, qa);
await writeJson('quality/milestone_sources_export_qa.json', qa);

let manifest = {};
try {
  manifest = await readJson(`raw/${snapshotId}/manifest.json`, {});
} catch {
  /* new manifest fields only */
}

await writeJson(`raw/${snapshotId}/manifest.json`, {
  ...manifest,
  milestone_sources_export_at: new Date().toISOString(),
  milestone_sources: Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
  ),
  milestone_fetch_errors: Object.keys(errors).length ? errors : undefined,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      snapshot_id: snapshotId,
      pharus_client_ids: pharusScopeIds.length,
      sources: qa.sources,
      fetch_errors: errors,
    },
    null,
    2,
  ),
);
