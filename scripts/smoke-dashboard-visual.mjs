/**
 * Smoke visual do dashboard NPS (375 / 768 / 1280 px).
 * Requer: servidor em PORT e puppeteer (npx puppeteer …).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT) || 5178;
const BASE = `http://127.0.0.1:${PORT}/`;
const WIDTHS = [375, 768, 1280, 1600];

function hasHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const docOverflow = doc.scrollWidth - doc.clientWidth;
    const bodyOverflow = body.scrollWidth - body.clientWidth;
    return Math.max(docOverflow, bodyOverflow) > 2;
  });
}

async function waitForDashboard(page) {
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('page-content');
        if (!el?.innerText?.trim()) return false;
        if (el.textContent?.includes('Carregando dados analíticos')) return false;
        return Boolean(el.querySelector('.gd-status, .hero__title, .hero'));
      },
      { timeout: 30000 },
    );
  } catch (err) {
    const snippet = await page.evaluate(() => document.getElementById('page-content')?.innerHTML?.slice(0, 400));
    throw new Error(`Dashboard não renderizou: ${snippet ?? '(vazio)'}\n${err.message}`);
  }
}

async function startServer() {
  const proc = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 30; i += 1) {
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

async function run() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.error('Instale puppeteer para smoke visual: npx puppeteer scripts/smoke-dashboard-visual.mjs');
    process.exit(2);
  }

  const server = await startServer();
  const browser = await puppeteer.default.launch({ headless: true });
  const failures = [];

  try {
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      page.on('pageerror', (err) => console.error(`[${width}px pageerror]`, err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') console.error(`[${width}px console]`, msg.text());
      });
      await page.setViewport({ width, height: 800 });

      for (const hash of [
        '#/executivo',
        '#/movimento',
        '#/eps',
        '#/voz-do-cliente',
        '#/drivers',
        '#/plano-de-acao',
        '#/jornada-perfil',
      ]) {
        await page.goto(`${BASE}${hash}`, { waitUntil: 'load', timeout: 60000 });
        await sleep(500);
        await waitForDashboard(page);

        if (hash === '#/executivo') {
          const stickySwitch = await page.$('#filter-sticky-switch');
          if (!stickySwitch) failures.push(`${width}px: switch Fixar filtros ausente`);
          const execRead = await page.$('#exec-diagnosis-title, .exec-diagnosis .section-title');
          if (!execRead) failures.push(`${width}px executivo: leitura executiva ausente`);
          if (width >= 1280) {
            const labelOk = await page.evaluate(() =>
              [...document.querySelectorAll('.help-tip__label, .metric-context__label')].some((el) =>
                el.textContent?.includes('Clientes com envio'),
              ),
            );
            if (!labelOk) failures.push(`${width}px executivo: KPI Clientes com envio ausente`);
            const btn = await page.$('#btn-ver-respondentes');
            if (!btn) failures.push(`${width}px executivo: Ver respondentes ausente`);
            else {
              await page.evaluate(() => document.getElementById('btn-ver-respondentes')?.click());
              await sleep(300);
              const open = await page.evaluate(() =>
                document.getElementById('respondents-drawer')?.classList.contains('is-open'),
              );
              if (!open) failures.push(`${width}px executivo: drawer respondentes não abriu`);
              const rowCount = await page.evaluate(
                () => document.querySelectorAll('#respondents-table tbody tr').length,
              );
              if (rowCount !== 25) {
                failures.push(`${width}px executivo: tabela respondentes esperava 25 linhas/página, got ${rowCount}`);
              }
              await page.evaluate(() => {
                document.getElementById('respondents-drawer-close')?.click();
              });
            }
          }
        }

        if (await hasHorizontalOverflow(page)) {
          failures.push(`${width}px ${hash}: scroll horizontal global detectado`);
        }

        const sidebar = await page.$('.sidebar-nav a[data-route="executivo"]');
        if (!sidebar) failures.push(`${width}px ${hash}: sidebar link executivo ausente`);
        const logo = await page.$('.sidebar__logo-img');
        if (!logo) failures.push(`${width}px ${hash}: logo/favicon no shell ausente`);
        const helpTipEl = await page.$('.help-tip__btn');
        if (hash === '#/executivo' && !helpTipEl) {
          failures.push(`${width}px executivo: tooltips didáticos ausentes`);
        }

        if (hash === '#/movimento') {
          const tableScroll = await page.$('#movimento-table-host .table-scroll');
          if (!tableScroll) {
            failures.push(`${width}px movimento: wrapper .table-scroll ausente`);
          } else {
            const wrapOverflow = await page.evaluate((el) => {
              const style = getComputedStyle(el);
              return style.overflowX === 'auto' || style.overflowX === 'scroll';
            }, tableScroll);
            if (!wrapOverflow) failures.push(`${width}px movimento: table-scroll sem overflow-x auto`);
          }

          const matrix = await page.$('.migration-matrix');
          if (!matrix) failures.push(`${width}px movimento: matriz 3×3 ausente`);
          const deltaBands = await page.$('.delta-band-grid');
          if (!deltaBands) failures.push(`${width}px movimento: delta-band-grid ausente`);

          if (width >= 768) {
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
              return rect.top >= expectedTop - 4 && rect.top <= expectedTop + 8;
            });
            if (!stickyOk) failures.push(`${width}px movimento: Fixar filtros — barra não sticky após 1000px`);
          }

          const row = await page.$('#clients-table tbody tr[data-client-id]');
          if (row) {
            await page.evaluate(() => {
              document.querySelector('#clients-table tbody tr[data-client-id]')?.click();
            });
            await sleep(300);
            const drawerOpen = await page.evaluate(() =>
              document.getElementById('client-drawer')?.classList.contains('is-open'),
            );
            const expanded = await page.evaluate(() =>
              document.getElementById('drawer-backdrop')?.getAttribute('aria-expanded'),
            );
            if (!drawerOpen) failures.push(`${width}px movimento: drawer não abriu ao clicar na linha`);
            if (expanded !== 'true') failures.push(`${width}px movimento: aria-expanded não true no backdrop`);

            await page.keyboard.press('Escape');
            await sleep(200);
            const drawerClosed = await page.evaluate(() =>
              !document.getElementById('client-drawer')?.classList.contains('is-open'),
            );
            if (!drawerClosed) failures.push(`${width}px movimento: Escape não fechou drawer`);
          }
        }

        if (hash === '#/executivo') {
          const canvas = await page.$('#chart-dist');
          if (!canvas) {
            const empty = await page.$('.gd-status, .placeholder-note');
            if (!empty) failures.push(`${width}px executivo: sem gráfico nem estado vazio`);
          }
        }

        if (hash === '#/eps') {
          const hero = await page.$('.hero__title');
          if (!hero) failures.push(`${width}px eps: hero ausente`);
          const tableWrap = await page.$('#eps-table-host .table-wrap');
          if (!tableWrap) failures.push(`${width}px eps: tabela sem .table-wrap`);
          const bubble = await page.$('#chart-ep-bubble');
          const emptyEp = await page.$('.gd-status');
          if (!bubble && !emptyEp) failures.push(`${width}px eps: sem gráfico nem estado vazio');

          if (width >= 1280) {
            const epRow = await page.$('#eps-table tbody tr[data-ep-name]');
            if (epRow) {
              await page.evaluate(() => {
                document.querySelector('#eps-table tbody tr[data-ep-name]')?.click();
              });
              await sleep(350);
              const epDrawerOpen = await page.evaluate(() =>
                document.getElementById('ep-drawer')?.classList.contains('is-open'),
              );
              if (!epDrawerOpen) failures.push(`${width}px eps: drawer EP não abriu`);
              const hasKpiGrid = await page.$('.ep-drawer-kpi-grid');
              if (!hasKpiGrid) failures.push(`${width}px eps: grid KPI do drawer ausente`);
              const clientCols = await page.evaluate(
                () => document.querySelectorAll('.ep-drawer-clients-table thead th').length,
              );
              if (clientCols !== 7) {
                failures.push(`${width}px eps: tabela clientes drawer esperava 7 colunas, got ${clientCols}`);
              }
              const drawerOverflow = await page.evaluate(() => {
                const d = document.getElementById('ep-drawer');
                if (!d) return 0;
                return d.scrollWidth - d.clientWidth;
              });
              if (drawerOverflow > 4) {
                failures.push(`${width}px eps: overflow horizontal no drawer EP (${drawerOverflow}px)`);
              }
              await page.evaluate(() => document.getElementById('ep-drawer-close')?.click());
              await sleep(200);
            }
          }
        }

        if (hash === '#/drivers') {
          const dHero = await page.$('.hero__title');
          if (!dHero) failures.push(`${width}px drivers: hero ausente`);
          const table = await page.$('#drivers-table, .quality-box');
          if (!table) failures.push(`${width}px drivers: tabela ou estado vazio ausente`);
        }

        if (hash === '#/plano-de-acao') {
          const aHero = await page.$('.hero__title');
          if (!aHero) failures.push(`${width}px plano: hero ausente`);
          const table = await page.$('#action-plan-table, .gd-status');
          if (!table) failures.push(`${width}px plano: tabela ou estado vazio ausente`);
        }

        if (hash === '#/voz-do-cliente') {
          const vocHero = await page.$('.hero__title');
          const vocEmpty = await page.$('.quality-box');
          if (!vocHero && !vocEmpty) failures.push(`${width}px voz: hero ou estado vazio ausente`);
          if (vocHero) {
            const matrix = await page.$('#voc-matrix, .metric-compact-grid');
            if (!matrix) failures.push(`${width}px voz: KPIs ou matriz ausentes`);
          }
        }

        if (hash === '#/jornada-perfil' && width >= 1280) {
          const jHero = await page.$('.hero__title');
          if (!jHero) failures.push(`${width}px jornada: hero ausente`);
          const journeyTable = await page.$('.jornada-journey-table colgroup col');
          if (!journeyTable) failures.push(`${width}px jornada: colgroup etapa×NPS ausente`);
          const stackCell = await page.$('.jornada-journey-table .cell-stack__primary');
          if (!stackCell) failures.push(`${width}px jornada: stack numérico etapa×NPS ausente`);
        }

        if (hash === '#/movimento' && width >= 1280) {
          const tierTable = await page.$('.resultados-tier-table colgroup col');
          if (tierTable) {
            const evidence = await page.$('.stat-evidence-block');
            if (!evidence) failures.push(`${width}px movimento: bloco evidência estatística ausente`);
          }
        }
      }

      if (width >= 1280) {
        await page.goto(`${BASE}#/executivo`, { waitUntil: 'load', timeout: 60000 });
        await sleep(400);
        await waitForDashboard(page);
        await page.evaluate(() => document.getElementById('open-methodology')?.click());
        await sleep(400);
        const methOpen = await page.evaluate(() => {
          const d = document.getElementById('methodology-drawer');
          return d?.classList.contains('is-open') && d.getAttribute('aria-hidden') === 'false';
        });
        if (!methOpen) failures.push(`${width}px: drawer Metodologia não abriu (is-open)`);
        const methTitle = await page.evaluate(() =>
          document.querySelector('#methodology-drawer .drawer__title')?.textContent?.trim(),
        );
        if (methTitle !== 'Metodologia do Analytics NPS') {
          failures.push(`${width}px: título metodologia inesperado: ${methTitle ?? 'ausente'}`);
        }
        await page.evaluate(() => document.getElementById('methodology-close')?.click());
        await sleep(200);
      }

      const focusRing = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        const sheet = [...document.styleSheets].some((ss) => {
          try {
            return [...ss.cssRules].some((r) => r.selectorText === ':focus-visible');
          } catch {
            return false;
          }
        });
        return sheet;
      });
      if (!focusRing) failures.push(`${width}px: regra :focus-visible não encontrada`);

      await page.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  if (failures.length) {
    console.error('Smoke visual — FALHAS:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(`Smoke visual OK — larguras: ${WIDTHS.join(', ')}px`);
  console.log('  ✓ sem scroll horizontal global');
  console.log('  ✓ sidebar, filtros, KPI rows, tabela, matriz, drawer + Escape');
  console.log('  ✓ executivo com canvas ou estado vazio');
  console.log('  ✓ :focus-visible presente');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
