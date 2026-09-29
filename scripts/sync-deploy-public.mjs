#!/usr/bin/env node
/**
 * Copia datasets de produção para data/deploy/public/ (versionável no git).
 * Vercel não recebe data/processed/*.json do .gitignore — o build usa este fallback.
 */
import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_PUBLIC_DATASETS,
  OPTIONAL_PUBLIC_DATASETS,
} from '../lib/deploy/public-datasets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_ROOT = join(ROOT, 'data/deploy/public');

const ALL = [...REQUIRED_PUBLIC_DATASETS, ...OPTIONAL_PUBLIC_DATASETS];

function main() {
  const missing = [];
  for (const rel of ALL) {
    const src = join(ROOT, 'data', rel);
    const dest = join(DEPLOY_ROOT, rel);
    if (!existsSync(src)) {
      if (REQUIRED_PUBLIC_DATASETS.includes(rel)) missing.push(rel);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
  if (missing.length) {
    console.error('Ausentes em data/ (rode refresh ou generators antes):');
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(`Deploy público sincronizado: ${DEPLOY_ROOT} (${ALL.length} paths)`);
}

main();
