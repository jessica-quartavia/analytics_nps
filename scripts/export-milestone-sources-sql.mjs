#!/usr/bin/env node
/**
 * Export SELECT-only das fontes de marcos via Postgres (service role SQL / connection string).
 * Requer BASE_QV_DATABASE_URL (URI postgres do projeto BASE QV, somente leitura).
 *
 * Uso: node scripts/export-milestone-sources-sql.mjs [snapshotId]
 */
import 'dotenv/config';
import pg from 'pg';
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { MILESTONE_SOURCE_TABLES } from '../lib/data/fetch-milestone-sources.mjs';
import { buildMilestoneExportQaDoc } from '../lib/data/milestone-export-qa.mjs';
import { pharusMilestoneClientScope } from '../lib/data/fetch-milestone-sources.mjs';

const { Client } = pg;

const snapshotId =
  process.argv[2] ??
  process.env.MILESTONES_RAW_SNAPSHOT ??
  (await readJson('snapshots/latest.json', null))?.raw_snapshot;

const dbUrl = process.env.BASE_QV_DATABASE_URL;
if (!snapshotId || !dbUrl) {
  console.error('Defina BASE_QV_DATABASE_URL e snapshotId (ou latest.raw_snapshot).');
  process.exit(1);
}

const sourceRows = await readJson(`raw/${snapshotId}/nps_responses.json`, []);
const allSends = await readJson(`raw/${snapshotId}/nps_sends.json`, []);
const clientsList = await readJson(`raw/${snapshotId}/clients.json`, []);
const clientsMap = new Map((clientsList ?? []).map((c) => [c.id, c]));
const clientIds = pharusMilestoneClientScope(sourceRows, allSends, clientsMap);

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const files = {};
const errors = {};

for (const [table, cfg] of Object.entries(MILESTONE_SOURCE_TABLES)) {
  try {
    const cols = cfg.select.split(',').map((s) => s.trim()).join(', ');
    const res = await client.query(
      `select ${cols} from public.${table} where client_id = any($1::uuid[])`,
      [clientIds],
    );
    files[cfg.file] = res.rows;
  } catch (err) {
    errors[table] = err.message ?? String(err);
    files[cfg.file] = [];
  }
}

await client.end();

for (const [name, rows] of Object.entries(files)) {
  await writeJson(`raw/${snapshotId}/${name}`, rows);
}

const qa = buildMilestoneExportQaDoc(files);
qa.scope = { snapshot_id: snapshotId, pharus_client_ids: clientIds.length };
if (Object.keys(errors).length) qa.fetch_errors = errors;

await writeJson(`raw/${snapshotId}/milestone_sources_export_qa.json`, qa);
await writeJson('quality/milestone_sources_export_qa.json', qa);

console.log(JSON.stringify({ ok: true, snapshot_id: snapshotId, sources: qa.sources, errors }, null, 2));
