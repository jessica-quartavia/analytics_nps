/**
 * Smoke interativo: filtros globais + sticky (Fixar filtros).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT) || 5179;
const BASE = `http://127.0.0.1:${PORT}/`;

async function startServer() {
  const proc = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return proc;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error(`Servidor não respondeu em ${BASE}`);
}

async function waitForDashboard(page) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('page-content');
      if (!el?.innerText?.trim()) return false;
      if (el.textContent?.includes('Carregando dados analíticos')) return false;
      return Boolean(el.querySelector('.gd-status, .hero__title, .hero, .metric-hero, .metric-compact'));
    },
    { timeout: 45000 },
  );
}

async function readValidResponses(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.metric-context__value, .metric-hero__value')];
    const valid = document.querySelector('.metric-context__value')?.textContent?.trim();
    return valid ?? nodes[0]?.textContent?.trim() ?? '';
  });
}

async function runRouteFilter(page, hash, applyFilter, readMetric, resetFilter, verifyReset = true) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load', timeout: 60000 });
  await sleep(400);
  await waitForDashboard(page);
  const before = await readMetric(page);
  await applyFilter(page);
  await sleep(350);
  const after = await readMetric(page);
  if (before === after) {
    throw new Error(`${hash}: métrica não mudou (${before} → ${after})`);
  }
  if (verifyReset) {
    if (resetFilter) await resetFilter(page);
    else {
      await page.select('#filter-category', '');
      await page.select('#filter-ep', '');
    }
    await sleep(500);
    const reset = await readMetric(page);
    if (reset !== before) {
      throw new Error(`${hash}: reset não restaurou valor (esperado ${before}, got ${reset})`);
    }
  }
}

async function run() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.error('Instale puppeteer para smoke de filtros.');
    process.exit(2);
  }

  const server = await startServer();
  const browser = await puppeteer.default.launch({ headless: true });
  const failures = [];

  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));
    await page.setViewport({ width: 1280, height: 900 });

    const routes = [
      {
        hash: '#/executivo',
        apply: async (p) => {
          await p.select('#filter-category', 'Promotor');
        },
        read: readValidResponses,
      },
      {
        hash: '#/movimento',
        apply: async (p) => {
          await p.select('#filter-category', 'Detrator');
        },
        read: async (p) =>
          p.evaluate(() => document.querySelector('.metric-compact__value')?.textContent?.trim() ?? ''),
      },
      {
        hash: '#/eps',
        apply: async (p) => {
          const ep = await p.$eval('#filter-ep option:nth-child(2)', (o) => o.value);
          await p.select('#filter-ep', ep);
        },
        read: async (p) =>
          p.evaluate(
            () =>
              [...document.querySelectorAll('.metric-compact__value')][1]?.textContent?.trim() ?? '',
          ),
      },
      {
        hash: '#/plano-de-acao',
        apply: async (p) => {
          await p.evaluate(() => {
            document.querySelector('#action-priority-chips [data-priority="Alta"]')?.click();
          });
        },
        read: async (p) =>
          p.evaluate(() => {
            const span = document.querySelector('.table-pagination span');
            const m = span?.textContent?.match(/\((\d+)\s+clientes\)/);
            return m ? m[1] : span?.textContent?.trim() ?? '';
          }),
        verifyReset: false,
      },
    ];

    for (const route of routes) {
      try {
        await runRouteFilter(
          page,
          route.hash,
          route.apply,
          route.read,
          route.reset,
          route.verifyReset ?? true,
        );
      } catch (err) {
        failures.push(`${route.hash}: ${err.message}`);
      }
    }

    await page.goto(`${BASE}#/movimento`, { waitUntil: 'load' });
    await sleep(400);
    await page.evaluate(() => {
      document.querySelector('#action-priority-chips [data-priority=""]')?.click();
      document.querySelector('#priority-chips [data-priority=""]')?.click();
    });
    await page.select('#filter-category', '');
    await page.select('#filter-ep', '');
    await waitForDashboard(page);
    await page.evaluate(() => {
      const el = document.getElementById('filter-sticky-switch');
      if (el) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(200);
    await page.evaluate(() => window.scrollTo(0, 1000));
    await sleep(300);
    const stickyOk = await page.evaluate(() => {
      const bar = document.getElementById('filters-bar');
      if (!bar?.classList.contains('is-sticky')) return false;
      const rect = bar.getBoundingClientRect();
      const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
      const expectedTop = topbar ? topbar.bottom : 56;
      return rect.top >= expectedTop - 4 && rect.top <= expectedTop + 8 && rect.height > 20;
    });
    if (!stickyOk) failures.push('sticky: barra não visível após scroll 1000px com Fixar ON');
  } finally {
    await browser.close();
    server.kill();
  }

  if (failures.length) {
    console.error('Smoke filtros — FALHAS:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log('Smoke filtros OK — rotas, reset e sticky scroll 1000px');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
