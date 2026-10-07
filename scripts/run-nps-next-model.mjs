#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function runNode(script) {
  const r = spawnSync(process.execPath, [join(ROOT, script)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function runPython() {
  const py = process.env.PYTHON ?? 'python';
  const script = join(ROOT, 'scripts', 'train-nps-next-cycle-model.py');
  const r = spawnSync(py, [script], { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runNode('scripts/build-nps-prediction-panel.mjs');
runPython();
