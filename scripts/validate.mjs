#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(label, cmd, args, opts = {}) {
  console.log(`\n=== ${label} ===\n`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: opts.shell ?? false,
    windowsHide: true,
  });
  if (r.status !== 0) {
    console.error(`\nvalidate: ${label} falhou (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run('healthcheck', process.execPath, [join(ROOT, 'scripts/healthcheck.mjs')]);
run('tests', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], { shell: true });
run('smoke:dashboard', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'smoke:dashboard'], {
  shell: true,
});

console.log('\n=== validate: OK ===\n');
