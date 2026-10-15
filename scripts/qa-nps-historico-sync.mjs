#!/usr/bin/env node
/**
 * Compara hashes do dataset NPS Histórico entre data/processed, deploy/public e dist.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'processed/historico2_clients_enriched.json';

function sha256File(abs) {
  if (!existsSync(abs)) return null;
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

const paths = {
  source: join(root, 'data', REL),
  deploy: join(root, 'data/deploy/public', REL),
  dist: join(root, 'dist/data', REL),
};

const hashes = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, sha256File(p)]));

let ok = true;
const present = Object.entries(hashes).filter(([, h]) => h);
if (present.length < 2) {
  console.error('QA sync: menos de 2 cópias encontradas. Rode npm run build.');
  process.exit(1);
}

const unique = new Set(present.map(([, h]) => h));
if (unique.size !== 1) {
  ok = false;
  console.error('QA sync FALHOU — hashes divergentes:');
  for (const [k, h] of Object.entries(hashes)) {
    console.error(`  ${k}: ${h ?? 'MISSING'} (${paths[k]})`);
  }
  process.exit(1);
}

let meta = {};
try {
  meta = JSON.parse(readFileSync(paths.source, 'utf8')).meta ?? {};
} catch {
  /* ignore */
}

console.log(
  JSON.stringify(
    {
      ok,
      file: REL,
      sha256: [...unique][0],
      dataset_version: meta.dataset_version,
      generated_at: meta.generated_at,
      build_commit: meta.build_commit,
      paths,
    },
    null,
    2,
  ),
);

process.exit(0);
