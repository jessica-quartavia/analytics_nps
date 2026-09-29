/**
 * Monta data/raw/<snapshotId>/ a partir de data/ingest/partials/*.json
 * (export SELECT BASE QV via MCP/SQL, sem escrita no banco).
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson, writeRawSnapshot } from '../lib/data/file-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const partialsDir = join(__dirname, '../data/ingest/partials');

async function readPartial(name) {
  const text = await readFile(join(partialsDir, name), 'utf8');
  return JSON.parse(text);
}

export async function assembleIngestSnapshot(snapshotId) {
  const nps_cycles = await readPartial('nps_cycles.json');
  const nps_sends = await readPartial('nps_sends.json');
  const clients = await readPartial('clients.json');
  const r1 = await readPartial('nps_responses_1.json');
  const r2 = await readPartial('nps_responses_2.json');
  const nps_responses = [...r1, ...r2];
  const client_journeys = await readPartial('client_journeys.json');
  const journey_stages = await readPartial('journey_stages.json');
  const engenheiro_transfer_logs = await readPartial('engenheiro_transfer_logs.json');
  const engenheiros_patrimoniais = await readPartial('engenheiros_patrimoniais.json');

  await writeRawSnapshot(snapshotId, {
    'nps_cycles.json': nps_cycles,
    'nps_responses.json': nps_responses,
    'nps_sends.json': nps_sends,
    'clients.json': clients,
    'client_journeys.json': client_journeys,
    'journey_stages.json': journey_stages,
    'engenheiro_transfer_logs.json': engenheiro_transfer_logs,
    'engenheiros_patrimoniais.json': engenheiros_patrimoniais,
  });

  await writeJson(`raw/${snapshotId}/manifest.json`, {
    generated_at: new Date().toISOString(),
    source_project_ref: 'lacinxsvjdwalkchxyeo',
    source_counts: {
      nps_cycles: nps_cycles.length,
      nps_responses: nps_responses.length,
      nps_sends: nps_sends.length,
      clients: clients.length,
    },
    ingest_source: 'BASE_QV_MCP_SQL_EXPORT',
  });

  return snapshotId;
}

if (process.argv[1]?.endsWith('assemble-ingest-snapshot.mjs')) {
  const snapshotId = process.argv[2];
  if (!snapshotId) {
    console.error('Uso: node scripts/assemble-ingest-snapshot.mjs <snapshot-id>');
    process.exit(1);
  }
  const id = await assembleIngestSnapshot(snapshotId);
  console.log(JSON.stringify({ ok: true, snapshotId: id }));
}
