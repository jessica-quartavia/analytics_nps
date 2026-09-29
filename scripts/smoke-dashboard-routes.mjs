#!/usr/bin/env node
/**
 * Smoke mínimo: módulos das rotas carregam (sem SyntaxError no grafo de imports).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT) || 5179;

async function startServer() {
  const proc = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return proc;
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  proc.kill();
  throw new Error('dev-server did not start');
}

const routes = [
  'executivo',
  'movimento',
  'eps',
  'voz-do-cliente',
  'jornada-perfil',
  'drivers',
  'plano-de-acao',
];

const proc = await startServer();
try {
  for (const page of [
    'movimento-jornada.js',
    'executivo.js',
    'movimento.js',
    'eps.js',
    'voz-do-cliente.js',
    'jornada-perfil.js',
    'drivers.js',
    'plano-de-acao.js',
  ]) {
    await import(`file://${join(ROOT, 'dashboard', 'js', 'pages', page)}`);
  }
  for (const route of routes) {
    const res = await fetch(`http://127.0.0.1:${PORT}/data/processed/cycles.json`);
    if (!res.ok) throw new Error(`cycles.json HTTP ${res.status}`);
  }
  console.log(`smoke-dashboard-routes: OK (${routes.length} rotas, imports pages)`);
} finally {
  proc.kill();
}
