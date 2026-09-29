#!/usr/bin/env node
/**
 * Grava arrays JSON exportados (ex.: via Supabase MCP execute_sql) no snapshot raw.
 * Uso: node scripts/write-milestone-json-from-sql.mjs <snapshotId> <file.json> < path/to/array.json
 */
import { readFileSync } from 'node:fs';
import { writeJson, readJson } from '../lib/data/file-store.mjs';
import { buildMilestoneExportQaDoc } from '../lib/data/milestone-export-qa.mjs';

const snapshotId = process.argv[2];
const fileName = process.argv[3];
if (!snapshotId || !fileName) {
  console.error('Uso: write-milestone-json-from-sql.mjs <snapshotId> <file.json>');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(0, 'utf8'));
if (!Array.isArray(rows)) {
  console.error('stdin deve ser JSON array');
  process.exit(1);
}

await writeJson(`raw/${snapshotId}/${fileName}`, rows);

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
  sourceMap[n] = n === fileName ? rows : await readJson(`raw/${snapshotId}/${n}`, []);
}

const qa = buildMilestoneExportQaDoc(sourceMap);
qa.scope = { snapshot_id: snapshotId, note: 'QA parcial/atualizado após import SQL' };
await writeJson(`raw/${snapshotId}/milestone_sources_export_qa.json`, qa);
await writeJson('quality/milestone_sources_export_qa.json', qa);

console.log(JSON.stringify({ ok: true, file: fileName, rows: rows.length, qa: qa.sources[fileName] }, null, 2));
