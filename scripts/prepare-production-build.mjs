#!/usr/bin/env node
/**
 * Pipeline de build Vercel: gera datasets derivados → sync deploy/public → dist.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStatic } from './build-static.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function runNodeScript(scriptRel) {
  const r = spawnSync(process.execPath, [join(ROOT, scriptRel)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

runNodeScript('scripts/generate-phase1-analytics.mjs');
runNodeScript('scripts/sync-deploy-public.mjs');
runNodeScript('scripts/write-dashboard-auth-config.mjs');

const result = buildStatic();
console.log('Build estático OK:', result.dist);
console.log(`  datasets: ${result.copiedData.length} arquivos em dist/data/`);
console.log(`  index: ${result.indexHtml}`);
