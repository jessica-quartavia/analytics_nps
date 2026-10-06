import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectDataRoot, writeJson } from '../data/file-store.mjs';

const PARTIAL_MAP = {
  'nps_cycles.json': 'nps_cycles.json',
  'nps_sends.json': 'nps_sends.json',
  'clients.json': 'clients.json',
  'client_journeys.json': 'client_journeys.json',
  'journey_stages.json': 'journey_stages.json',
  'engenheiro_transfer_logs.json': 'engenheiro_transfer_logs.json',
  'engenheiros_patrimoniais.json': 'engenheiros_patrimoniais.json',
  'cancellations.json': 'cancellations.json',
  'freeze_change_requests.json': 'freeze_change_requests.json',
};

/** Copia raw snapshot → ingest/partials; divide nps_responses em 2 partes se grande. */
export async function syncPartialsFromRawSnapshot(snapshotId) {
  const root = getProjectDataRoot();
  const rawDir = join(root, 'raw', snapshotId);
  const partialsDir = join(root, 'ingest/partials');
  mkdirSync(partialsDir, { recursive: true });

  const manifestPath = join(rawDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const [rawName, partialName] of Object.entries(PARTIAL_MAP)) {
    const src = join(rawDir, rawName);
    try {
      copyFileSync(src, join(partialsDir, partialName));
    } catch {
      /* optional file */
    }
  }

  const respPath = join(rawDir, 'nps_responses.json');
  const responses = JSON.parse(readFileSync(respPath, 'utf8'));
  const mid = Math.ceil(responses.length / 2);
  writeFileSync(
    join(partialsDir, 'nps_responses_1.json'),
    `${JSON.stringify(responses.slice(0, mid), null, 2)}\n`,
  );
  writeFileSync(
    join(partialsDir, 'nps_responses_2.json'),
    `${JSON.stringify(responses.slice(mid), null, 2)}\n`,
  );

  let maxClientUpdated = null;
  let maxNpsSubmitted = null;
  for (const c of JSON.parse(readFileSync(join(rawDir, 'clients.json'), 'utf8'))) {
    const u = c.updated_at ? String(c.updated_at).slice(0, 19) : null;
    if (u && (!maxClientUpdated || u > maxClientUpdated)) maxClientUpdated = u;
  }
  for (const r of responses) {
    const s = r.submitted_at ? String(r.submitted_at).slice(0, 19) : null;
    if (s && (!maxNpsSubmitted || s > maxNpsSubmitted)) maxNpsSubmitted = s;
  }

  const ingestManifest = {
    ...manifest,
    synced_at: new Date().toISOString(),
    snapshot_id: snapshotId,
    source_max_timestamps: {
      clients_updated_at: maxClientUpdated,
      nps_responses_submitted_at: maxNpsSubmitted,
    },
    partials: {
      nps_responses_total: responses.length,
      nps_responses_1: mid,
      nps_responses_2: responses.length - mid,
    },
  };
  await writeJson('ingest/partials/manifest.json', ingestManifest);

  return {
    snapshotId,
    counts: manifest.source_counts ?? {},
    maxClientUpdated,
    maxNpsSubmitted,
    nps_responses: responses.length,
  };
}
