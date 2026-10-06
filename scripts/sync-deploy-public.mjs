#!/usr/bin/env node
/**
 * Sincroniza data/deploy/public/ a partir de data/ (quando existir) ou preserva bundle versionado.
 * Vercel: clone limpo — REQUIRED só falha se ausente em data/ E em data/deploy/public/.
 */
import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_PUBLIC_DATASETS,
  OPTIONAL_PUBLIC_DATASETS,
} from '../lib/deploy/public-datasets.mjs';
import { resolvePublicDataset } from '../lib/deploy/dataset-resolve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_ROOT = join(ROOT, 'data/deploy/public');

const ALL = [...REQUIRED_PUBLIC_DATASETS, ...OPTIONAL_PUBLIC_DATASETS];

function main() {
  const missing = [];
  let copied = 0;
  let preserved = 0;

  for (const rel of ALL) {
    const dest = resolve(join(DEPLOY_ROOT, rel));
    const resolved = resolvePublicDataset(ROOT, rel);

    if (!resolved) {
      if (REQUIRED_PUBLIC_DATASETS.includes(rel)) missing.push(rel);
      continue;
    }

    if (resolved.path === dest) {
      preserved += 1;
      continue;
    }

    mkdirSync(dirname(dest), { recursive: true });
    cpSync(resolved.path, dest);
    copied += 1;
  }

  if (missing.length) {
    console.error('Datasets obrigatórios ausentes em data/ e data/deploy/public/:');
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  console.log(
    `Deploy público sincronizado: ${DEPLOY_ROOT} (${ALL.length} paths, ${copied} copiados, ${preserved} já no bundle)`,
  );
}

main();
