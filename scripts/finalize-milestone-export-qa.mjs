#!/usr/bin/env node
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { buildMilestoneExportQaDoc } from '../lib/data/milestone-export-qa.mjs';

const snapshotId = process.argv[2] ?? (await readJson('snapshots/latest.json', null))?.raw_snapshot;
if (!snapshotId) process.exit(1);

const names = [
  'client_meetings.json',
  'manual_meetings.json',
  'client_mecanismos.json',
  'cancellations.json',
  'client_engajamento_history.json',
  'freeze_change_requests.json',
];
const sourceMap = {};
for (const n of names) {
  sourceMap[n] = await readJson(`raw/${snapshotId}/${n}`, []);
}

const qa = buildMilestoneExportQaDoc(sourceMap);
qa.scope = {
  snapshot_id: snapshotId,
  pharus_client_ids: null,
  note: 'QA consolidado pós-import SELECT (escopo PHARUS).',
};
await writeJson(`raw/${snapshotId}/milestone_sources_export_qa.json`, qa);
await writeJson('quality/milestone_sources_export_qa.json', qa);

let manifest = await readJson(`raw/${snapshotId}/manifest.json`, {});
await writeJson(`raw/${snapshotId}/manifest.json`, {
  ...manifest,
  milestone_sources_export_at: new Date().toISOString(),
  milestone_sources: Object.fromEntries(
    Object.entries(sourceMap).map(([k, v]) => [k, v.length]),
  ),
});

console.log(JSON.stringify({ ok: true, snapshot_id: snapshotId, sources: qa.sources }, null, 2));
