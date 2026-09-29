#!/usr/bin/env node
/**
 * Smoke HTTP do dist/ + boot do dashboard no preview estático.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatic } from './build-static.mjs';
import { REQUIRED_BOOT_DATASETS, publicUrlForDataset } from '../lib/deploy/public-datasets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_STATIC_PORT) || 4179;
const BASE = `http://127.0.0.1:${PORT}/`;

async function waitServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  throw new Error(`Preview estático não respondeu em ${BASE}`);
}

async function assertJsonOk(path) {
  const res = await fetch(`${BASE}${path.replace(/^\//, '')}`);
  if (res.status !== 200) {
    throw new Error(`${path} → HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) {
    throw new Error(`${path} → Content-Type inesperado: ${ct}`);
  }
  await res.json();
}

async function run() {
  buildStatic();

  const proc = spawn(process.execPath, ['scripts/preview-static.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitServer();
    const resHome = await fetch(BASE);
    if (resHome.status !== 200) throw new Error(`GET / → ${resHome.status}`);

    for (const rel of REQUIRED_BOOT_DATASETS) {
      await assertJsonOk(publicUrlForDataset(rel));
    }

    let puppeteer;
    try {
      puppeteer = await import('puppeteer');
    } catch {
      console.log('Smoke HTTP datasets OK (puppeteer ausente — skip UI)');
      return;
    }

    const browser = await puppeteer.default.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[browser]', msg.text());
    });
    await page.goto(`${BASE}#/executivo`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(
      () => {
        const el = document.getElementById('page-content');
        if (!el?.innerText) return false;
        if (el.textContent?.includes('Carregando dados analíticos')) return false;
        return true;
      },
      { timeout: 45000 },
    );
    const bodyText = await page.evaluate(() => document.getElementById('page-content')?.innerText ?? '');
    if (bodyText.includes('Os dados analíticos ainda não foram gerados')) {
      throw new Error('Executivo ainda mostra mensagem de dados ausentes');
    }
    if (bodyText.includes('Dataset ausente no deploy')) {
      throw new Error('Executivo mostra erro 404 de dataset');
    }
    await browser.close();
    console.log('Smoke static OK — datasets HTTP 200 e Executivo renderizou');
  } finally {
    proc.kill();
  }
}

run().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
