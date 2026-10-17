#!/usr/bin/env node
/**
 * Compara hashes do dataset NPS Histórico entre data/processed, deploy/public e dist.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REL_FILES = [
  'processed/historico2_clients_enriched.json',
  'processed/nps_measurements_consolidated.json',
];

function sha256File(abs) {
  if (!existsSync(abs)) return null;
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

let ok = true;
const report = [];

for (const REL of REL_FILES) {
  const paths = {
    source: join(root, 'data', REL),
    deploy: join(root, 'data/deploy/public', REL),
    dist: join(root, 'dist/data', REL),
  };
  const hashes = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, sha256File(p)]));
  const present = Object.entries(hashes).filter(([, h]) => h);
  if (present.length < 2) {
    console.error(`QA sync: ${REL} — menos de 2 cópias. Rode npm run build.`);
    ok = false;
    continue;
  }
  const unique = new Set(present.map(([, h]) => h));
  if (unique.size !== 1) {
    ok = false;
    console.error(`QA sync FALHOU — ${REL} hashes divergentes:`);
    for (const [k, h] of Object.entries(hashes)) {
      console.error(`  ${k}: ${h ?? 'MISSING'} (${paths[k]})`);
    }
    continue;
  }
  let meta = {};
  try {
    meta = JSON.parse(readFileSync(paths.source, 'utf8')).meta ?? {};
  } catch {
    /* ignore */
  }
  report.push({
    file: REL,
    sha256: [...unique][0],
    dataset_version: meta.dataset_version,
    generated_at: meta.generated_at,
    build_commit: meta.build_commit,
  });
}

console.log(JSON.stringify({ ok, files: report }, null, 2));
process.exit(ok ? 0 : 1);
