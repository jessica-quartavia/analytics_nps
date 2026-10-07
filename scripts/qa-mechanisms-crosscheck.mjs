#!/usr/bin/env node
/**
 * QA: mecanismos BASE0 vs enriched vs marcos (≥5 clientes).
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../lib/data/file-store.mjs';
import { createBusinessDataClient } from '../lib/persistence/business-data-client.mjs';
import { fetchAllPaginated } from '../lib/analytics/payment-entry-date.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

const SAMPLE_NAMES = [
  'Jane Cronst',
  'Carlos D G de Magalhães',
  'Rodrigo Orlando Martins',
  'Danilo Soares Santana',
  'Julio Sassi',
];

async function main() {
  const enriched = (await readJson('processed/historical_nps_enriched.json', {})).responses ?? [];
  const milestones = (await readJson('processed/nps_client_milestones.json', {})).entries ?? [];
  const mechAt = (await readJson('processed/nps_mechanisms_at_response.json', {})).entries ?? [];

  let sb = null;
  let base0Mec = [];
  try {
    sb = createBusinessDataClient('base0');
    base0Mec = await fetchAllPaginated(
      sb,
      'mecanismos_cliente',
      'base_qv_id,status,data_implementacao,mecanismo_nome',
    );
  } catch (e) {
    console.warn('BASE0 mecanismos skip:', e.message);
  }

  const byClientBase0 = new Map();
  for (const m of base0Mec) {
    const id = m.base_qv_id;
    if (!id) continue;
    if (!byClientBase0.has(id)) byClientBase0.set(id, []);
    byClientBase0.get(id).push(m);
  }

  const report = { clients: [], summary: { pit_rows: mechAt.length, milestones_with_mech: 0 } };
  for (const name of SAMPLE_NAMES) {
    const en = enriched.find((r) => (r.client_name ?? '').trim() === name);
    const ms = milestones.find((r) => (r.client_name ?? '').trim() === name);
    const pit = mechAt.filter((r) => r.client_id === en?.client_id);
    const b0 = en ? byClientBase0.get(en.client_id) ?? [] : [];
    if (ms?.mechanisms_count_before_response != null) report.summary.milestones_with_mech += 1;
    report.clients.push({
      name,
      client_id: en?.client_id ?? ms?.client_id,
      base0_mecanismos_rows: b0.length,
      enriched_mechanisms_before: en?.mechanisms_before_response,
      enriched_status: en?.mechanism_temporal_status,
      milestone_count: ms?.mechanisms_count_before_response,
      milestone_quality: ms?.mechanisms_quality,
      pit_bucket_rows: pit.length,
    });
  }

  const bucketDist = { 0: 0, 1: 0, '2+': 0 };
  for (const e of mechAt) {
    const b = e.mechanism_bucket;
    if (b && bucketDist[b] != null) bucketDist[b] += 1;
  }
  report.summary.bucket_dist = bucketDist;
  report.summary.milestones_sources =
    (await readJson('processed/nps_client_milestones.json', {})).meta?.sources_loaded ?? {};

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
