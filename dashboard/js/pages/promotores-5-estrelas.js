import {
  getPromotores5Estrelas,
  hasPromotores5Estrelas,
} from '../data/analytics-store.js';
import {
  defaultPromotoresFilters,
  applyInternalAnalysisFilters,
  filterOptions,
  mechanismOptions,
  statusOptionsFromRows,
  professionCategoryFilterOptions,
  NAO_INFORMADO,
} from '../data/promotores-5-estrelas-view.mjs';
import { computePromotoresAnalytics } from '../../../lib/analytics/promotores-5-estrelas.mjs';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatPct, formatNps, formatDate } from '../utils/format.js';
import { exportFilteredCsv } from '../utils/export-filtered-csv.mjs';
import { exportFilteredXlsx } from '../utils/export-filtered-xlsx.mjs';
import { buildValueLabelPlugin } from '../ui/chart-value-labels.mjs';
import { stickyFiltersEnabled, setStickyFiltersEnabled } from '../utils/sticky-filters.js';
import { showPageToast } from '../utils/page-toast.mjs';
import { drawerShell } from '../ui/drawer-layout.mjs';

let charts = [];
let pageFilters = defaultPromotoresFilters();
let tablePage = 1;
const PAGE_SIZE = 20;

const P5_DONUT_COLORS = [
  '#e85d3a',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#64748b',
  '#94a3b8',
];
const P5_NA_COLOR = '#cbd5e1';

function destroyCharts() {
  for (const c of charts) c.destroy();
  charts = [];
}

function exportDateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function exportColumns() {
  return [
    { header: 'Cliente', key: 'client_name' },
    { header: 'Client ID', key: 'client_id' },
    { header: 'Status', key: 'status' },
    { header: 'Programa', key: 'programa' },
    { header: 'EP', key: 'ep_name' },
    { header: 'Profissão', key: 'profession' },
    { header: 'Categoria profissional', key: 'profession_category' },
    { header: 'Estado', key: 'state' },
    { header: 'Região', key: 'region' },
    { header: 'NPS anterior', key: 'nps_previous' },
    { header: 'NPS atual', key: 'nps_latest' },
    { header: 'Data NPS anterior', key: 'nps_previous_at' },
    { header: 'Data NPS atual', key: 'nps_latest_at' },
    { header: 'Qtd mecanismos', key: 'mechanism_count' },
    { header: 'Principais mecanismos', value: (r) => (r.mechanisms ?? []).join('; ') },
  ];
}

/**
 * @param {string} canvasId
 * @param {{ label: string, count: number, pct?: number, pct_of_eligible?: number }[]} series
 * @param {{ formatKind?: 'count'|'pct', tooltipKind?: 'default'|'mechanism'|'ep'|'region'|'state' }} opts
 */
function mountHorizontalBar(canvasId, series, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart || !series.length) return;
  const { formatKind = 'count', tooltipKind = 'default' } = opts;
  const labels = series.map((r) => r.label ?? r.ep ?? r.bucket);
  const values = series.map((r) => (formatKind === 'pct' ? r.pct : r.count));

  charts.push(
    new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: 'rgba(232, 93, 74, 0.78)', borderRadius: 4, barThickness: 18 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: formatKind === 'pct' ? 52 : 36 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                return items[0]?.label ?? '';
              },
              label(ctx) {
                const row = series[ctx.dataIndex];
                if (!row) return '';
                const count = row.count;
                const pct = row.pct ?? row.pct_of_eligible;
                if (tooltipKind === 'mechanism') {
                  return [
                    `${count} clientes`,
                    `${formatPct(pct ?? 0, 1)} do grupo`,
                  ];
                }
                if (tooltipKind === 'ep') {
                  return [`${count} clientes`, `${formatPct(pct ?? 0, 1)} do grupo`];
                }
                return [`${count} clientes`, `${formatPct(pct ?? 0, 1)}`];
              },
            },
          },
        },
        scales: {
          x: { beginAtZero: true, grace: '12%' },
          y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } },
        },
      },
      plugins: [
        buildValueLabelPlugin({
          getValue: (i) => values[i],
          formatKind,
          horizontalBarEnd: true,
        }),
      ],
    }),
  );
}

function mountProfessionDonut(canvasId, categories) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart || !categories.length) return;
  const labels = categories.map((c) => c.label);
  const data = categories.map((c) => c.count);
  const colors = labels.map((lb, i) => (lb === NAO_INFORMADO ? P5_NA_COLOR : P5_DONUT_COLORS[i % P5_DONUT_COLORS.length]));

  charts.push(
    new window.Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              font: { size: 11 },
              sort(a, b) {
                const la = a.text;
                const lb = b.text;
                if (la === NAO_INFORMADO) return 1;
                if (lb === NAO_INFORMADO) return -1;
                return 0;
              },
            },
          },
          tooltip: {
            callbacks: {
              title(items) {
                return items[0]?.label ?? '';
              },
              label(ctx) {
                const row = categories[ctx.dataIndex];
                if (!row) return '';
                return [
                  `${row.count} clientes`,
                  `${formatPct(row.pct ?? 0, 1)} do grupo`,
                ];
              },
            },
          },
        },
      },
    }),
  );
}

function renderFiltersPanel(allClients) {
  const stickyOn = stickyFiltersEnabled();
  const statuses = ['Ativo', ...statusOptionsFromRows(allClients).filter((s) => s !== 'Ativo')];
  const statusOpts = statuses
    .map(
      (s) =>
        `<option value="${escapeAttr(s)}"${pageFilters.status === s ? ' selected' : ''}>${escapeHtml(s)}</option>`,
    )
    .join('');
  const mk = (id, label, options, current) => {
    const opts = [`<option value="all">Todos</option>`]
      .concat(
        options.map(
          (o) =>
            `<option value="${escapeAttr(o)}"${current === o ? ' selected' : ''}>${escapeHtml(o)}</option>`,
        ),
      )
      .join('');
    return `<div class="filter-field"><label for="${id}">${escapeHtml(label)}</label><select id="${id}" class="select-input">${opts}</select></div>`;
  };
  const catOpts = ['<option value="all">Todas</option>']
    .concat(
      professionCategoryFilterOptions().map(
        (c) =>
          `<option value="${escapeAttr(c)}"${pageFilters.professionCategory === c ? ' selected' : ''}>${escapeHtml(c)}</option>`,
      ),
    )
    .join('');

  return `
    <article class="card filters-panel promotores-filters-card ${stickyOn ? 'promotores-filters-card--sticky' : ''}" id="p5-filters-card">
      <div class="filters-panel__head">
        <h2 class="section-title section-title--flush">Filtros</h2>
        <div class="filters-panel__actions">
          <label class="filter-switch"><span>Fixar filtros</span>
            <input type="checkbox" id="p5-sticky-switch" ${stickyOn ? 'checked' : ''} />
          </label>
          <button type="button" class="btn btn--secondary btn--sm" id="p5-clear-filters">Limpar filtros</button>
        </div>
      </div>
      <div class="filters-panel__grid promotores-filters-grid promotores-filters-grid--row1">
        <div class="filter-field"><label for="p5-filter-status">Status</label>
          <select id="p5-filter-status" class="select-input">
            <option value="all"${pageFilters.status === 'all' ? ' selected' : ''}>Todos</option>
            ${statusOpts}
          </select>
        </div>
        ${mk('p5-filter-programa', 'Programa', filterOptions(allClients, 'programa'), pageFilters.programa)}
        ${mk('p5-filter-ep', 'EP', filterOptions(allClients, 'ep_name'), pageFilters.ep)}
        ${mk('p5-filter-state', 'Estado', filterOptions(allClients, 'state'), pageFilters.state)}
        ${mk('p5-filter-region', 'Região', filterOptions(allClients, 'region'), pageFilters.region)}
      </div>
      <div class="filters-panel__grid promotores-filters-grid promotores-filters-grid--row2">
        <div class="filter-field"><label for="p5-filter-prof-cat">Categoria profissional</label>
          <select id="p5-filter-prof-cat" class="select-input">${catOpts}</select>
        </div>
        ${mk('p5-filter-profession', 'Profissão', filterOptions(allClients, 'profession'), pageFilters.profession)}
        ${mk('p5-filter-mech', 'Mecanismo', mechanismOptions(allClients), pageFilters.mechanism)}
        ${mk('p5-filter-mech-count', 'Qtd. mecanismos', ['0', '1', '2', '3', '4', '5+'], pageFilters.mechanismCount)}
        <div class="filter-field filter-field--search-wide">
          <label for="p5-filter-q">Busca cliente</label>
          <div class="search-input-wrap">
            <svg class="search-input-wrap__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
            <input id="p5-filter-q" class="text-input search-input-wrap__input" type="search" placeholder="Buscar por nome, e-mail ou ID" value="${escapeAttr(pageFilters.q ?? '')}" />
          </div>
        </div>
      </div>
    </article>`;
}

function compactKpi(label, value) {
  return `<article class="p5-kpi"><span class="p5-kpi__label">${escapeHtml(label)}</span><strong class="p5-kpi__value">${escapeHtml(String(value ?? '—'))}</strong></article>`;
}

function renderTableRows(rows) {
  const start = (tablePage - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  if (!slice.length) {
    return '<tr><td colspan="9">Nenhum cliente no recorte.</td></tr>';
  }
  return slice
    .map(
      (r) => `<tr data-client-id="${escapeAttr(r.client_id)}" tabindex="0" role="button">
        <td class="col-name">${escapeHtml(r.client_name)}</td>
        <td>${escapeHtml(r.programa)}</td>
        <td>${escapeHtml(r.ep_name)}</td>
        <td>${escapeHtml(r.profession)}</td>
        <td>${escapeHtml(r.state)}</td>
        <td class="num">${r.nps_previous}</td>
        <td class="num">${r.nps_latest}</td>
        <td class="num">${r.mechanism_count}</td>
        <td>${escapeHtml(r.mechanisms_top || '—')}</td>
      </tr>`,
    )
    .join('');
}

function openDrawer(row) {
  const backdrop = document.getElementById('p5-drawer-backdrop');
  const drawer = document.getElementById('p5-drawer');
  if (!backdrop || !drawer || !row) return;
  drawer.innerHTML = drawerShell({
    title: row.client_name,
    closeId: 'p5-drawer-close',
    bodyHtml: `
      <section><h3>Resumo</h3>
        <p><strong>Programa:</strong> ${escapeHtml(row.programa)} · <strong>Status:</strong> ${escapeHtml(row.status)}</p>
        <p><strong>EP:</strong> ${escapeHtml(row.ep_name)}</p>
      </section>
      <section><h3>Últimos NPS</h3>
        <p><strong>Anterior:</strong> ${row.nps_previous} · ${escapeHtml(row.nps_previous_category)} · ${escapeHtml(formatDate(row.nps_previous_at))}<br/>
        <span class="note-muted">${escapeHtml(row.previous_nps_cycle ?? '')}</span></p>
        <p><strong>Atual:</strong> ${row.nps_latest} · Promotor 5 estrelas · ${escapeHtml(formatDate(row.nps_latest_at))}<br/>
        <span class="note-muted">${escapeHtml(row.latest_nps_cycle ?? '')}</span></p>
      </section>
      <section><h3>Perfil</h3>
        <p>Profissão: ${escapeHtml(row.profession)}</p>
        <p>Categoria: ${escapeHtml(row.profession_category ?? '—')}</p>
        <p>Estado: ${escapeHtml(row.state)} · Cidade: ${escapeHtml(row.city)} · Região: ${escapeHtml(row.region)}</p>
      </section>
      <section><h3>Mecanismos</h3>
        <ul>${(row.mechanisms ?? []).map((m) => `<li>${escapeHtml(m)}</li>`).join('') || '<li>Nenhum</li>'}</ul>
      </section>`,
  });
  backdrop.classList.add('is-open');
  drawer.classList.add('is-open');
  document.getElementById('p5-drawer-close')?.addEventListener('click', closePromotoresDrawer);
}

export function closePromotoresDrawer() {
  document.getElementById('p5-drawer-backdrop')?.classList.remove('is-open');
  document.getElementById('p5-drawer')?.classList.remove('is-open');
}

export function renderPromotores5Estrelas(root) {
  destroyCharts();
  if (!hasPromotores5Estrelas()) {
    root.innerHTML = `<div class="gd-status"><p>Dataset indisponível. Execute a geração do artefato Promotores 5 Estrelas.</p></div>`;
    return;
  }
  const doc = getPromotores5Estrelas();
  const eligibleClients = doc.clients ?? [];
  const filteredClients = applyInternalAnalysisFilters(eligibleClients, pageFilters);
  const activeBase = doc.universe_audit?.active_clients ?? 1;
  const analytics = computePromotoresAnalytics(filteredClients, { activeClientsTotal: activeBase });
  const { kpis, charts: ch } = analytics;

  const maxPage = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  if (tablePage > maxPage) tablePage = maxPage;
  const start = filteredClients.length ? (tablePage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(tablePage * PAGE_SIZE, filteredClients.length);

  root.innerHTML = `
    <header class="hero hero--compact">
      <div class="hero__title-row">
        <h1 class="hero__title">Promotores 5 Estrelas <span class="badge badge--internal">ANÁLISE INTERNA</span></h1>
      </div>
      <p class="hero__lead">Perfil dos clientes com nota máxima no NPS atual e que permaneceram Promotores nas duas respostas mais recentes.</p>
    </header>
    <article class="card historico2-info-card">
      <span class="badge badge--method">BASE QV</span>
      <p class="historico2-info-card__text">Análise interna com dados de NPS, perfil cadastral e mecanismos da BASE QV.</p>
    </article>
    ${renderFiltersPanel(eligibleClients)}
    <div id="p5-sticky-sentinel" class="p5-sticky-sentinel" aria-hidden="true"></div>
    <div class="p5-kpi-grid">
      ${compactKpi('Clientes 5 estrelas', kpis.eligible_clients)}
      ${compactKpi('% dos clientes ativos', kpis.pct_of_active_base != null ? formatPct(kpis.pct_of_active_base, 1) : '—')}
      ${compactKpi('Nota média atual', kpis.mean_score_latest != null ? kpis.mean_score_latest.toFixed(2) : '—')}
      ${compactKpi('NPS médio do grupo', kpis.group_nps != null ? formatNps(kpis.group_nps) : '—')}
      ${compactKpi('Média de mecanismos', kpis.mean_mechanism_count != null ? kpis.mean_mechanism_count.toFixed(1) : '—')}
      ${compactKpi('% com 3+ mecanismos', kpis.pct_with_3_plus_mechanisms != null ? formatPct(kpis.pct_with_3_plus_mechanisms, 1) : '—')}
      ${compactKpi('Estado mais frequente', kpis.top_state ?? NAO_INFORMADO)}
      ${compactKpi('Profissão mais frequente', kpis.top_profession ?? NAO_INFORMADO)}
    </div>
    ${
      filteredClients.length === 0
        ? `<article class="card"><p class="gd-status">Nenhum cliente atende aos critérios atuais.</p></article>`
        : `
    <div class="p5-charts-grid">
      <article class="card chart-card p5-chart-card"><h2 class="section-title">Perfil profissional</h2><p class="note-muted">Categorias derivadas do cadastro.</p><div class="chart-wrap p5-chart-wrap"><canvas id="p5-chart-prof-cat"></canvas></div></article>
      <article class="card chart-card p5-chart-card"><h2 class="section-title">Distribuição por estado</h2><div class="chart-wrap p5-chart-wrap"><canvas id="p5-chart-state"></canvas></div></article>
      <article class="card chart-card p5-chart-card"><h2 class="section-title">Distribuição por região</h2><div class="chart-wrap p5-chart-wrap"><canvas id="p5-chart-region"></canvas></div></article>
      <article class="card chart-card p5-chart-card"><h2 class="section-title">Mecanismos mais comuns</h2><p class="note-muted">Clientes distintos com o mecanismo.</p><div class="chart-wrap p5-chart-wrap"><canvas id="p5-chart-mech"></canvas></div></article>
      <article class="card chart-card p5-chart-card"><h2 class="section-title">Qtd. de mecanismos por cliente</h2><div class="chart-wrap p5-chart-wrap p5-chart-wrap--short"><canvas id="p5-chart-mech-count"></canvas></div></article>
      <article class="card chart-card p5-chart-card"><h2 class="section-title">EPs com mais clientes 5 estrelas</h2><div class="chart-wrap p5-chart-wrap"><canvas id="p5-chart-ep"></canvas></div></article>
    </div>
    <article class="card chart-card"><h2 class="section-title">Profissões mais frequentes — Top 10</h2><div class="chart-wrap p5-chart-wrap"><canvas id="p5-chart-prof"></canvas></div></article>
    <article class="card chart-card"><h2 class="section-title">Combinação dos dois últimos NPS</h2><div class="chart-wrap p5-chart-wrap p5-chart-wrap--short"><canvas id="p5-chart-pairs"></canvas></div></article>`
    }
    <article class="card">
      <div class="p5-table-head">
        <h2 class="section-title section-title--flush">Clientes</h2>
        <div class="p5-table-export">
          <button type="button" class="btn btn--secondary btn--sm" id="p5-export-csv">↓ CSV</button>
          <button type="button" class="btn btn--secondary btn--sm" id="p5-export-xlsx">↓ Excel</button>
        </div>
      </div>
      <div class="table-scroll"><table class="gd-table" id="p5-table"><thead><tr>
        <th>Cliente</th><th>Programa</th><th>EP</th><th>Profissão</th><th>Estado</th><th>NPS anterior</th><th>NPS atual</th><th>Qtd mec.</th><th>Principais mecanismos</th>
      </tr></thead><tbody>${renderTableRows(filteredClients)}</tbody></table></div>
      <div class="table-pager table-pager--emphasis">
        <span class="table-pager__meta">Mostrando ${start}–${end} de ${filteredClients.length}</span>
        <div class="table-pager__buttons">
          <button type="button" class="btn btn--secondary btn--sm" id="p5-prev" ${tablePage <= 1 ? 'disabled' : ''}>← Anterior</button>
          <button type="button" class="btn btn--secondary btn--sm" id="p5-next" ${tablePage >= maxPage ? 'disabled' : ''}>Próxima →</button>
        </div>
      </div>
    </article>
    <div id="p5-drawer-backdrop" class="drawer-backdrop" aria-hidden="true"></div>
    <aside id="p5-drawer" class="drawer drawer--wide" aria-hidden="true"></aside>
  `;

  if (filteredClients.length) {
    mountProfessionDonut('p5-chart-prof-cat', ch.profession_categories ?? []);
    mountHorizontalBar('p5-chart-state', ch.states ?? [], { formatKind: 'pct', tooltipKind: 'state' });
    mountHorizontalBar('p5-chart-region', ch.regions ?? [], { formatKind: 'pct', tooltipKind: 'region' });
    mountHorizontalBar('p5-chart-mech', ch.mechanisms ?? [], { formatKind: 'count', tooltipKind: 'mechanism' });
    const mc = (ch.mechanism_count_buckets ?? []).map((r) => ({ label: r.bucket, count: r.count, pct: r.pct }));
    mountHorizontalBar('p5-chart-mech-count', mc, { formatKind: 'count' });
    const eps = (ch.eps ?? []).map((r) => ({ label: r.ep, count: r.count, pct: r.pct }));
    mountHorizontalBar('p5-chart-ep', eps, { formatKind: 'count', tooltipKind: 'ep' });
    mountHorizontalBar('p5-chart-prof', ch.professions ?? [], { formatKind: 'count' });
    mountHorizontalBar('p5-chart-pairs', ch.nps_pairs ?? [], { formatKind: 'count' });
  }

  bindPromotores5Estrelas(root, filteredClients, eligibleClients);
  mountPromotoresStickyShadow();
}

let p5StickyObserver = null;

function mountPromotoresStickyShadow() {
  p5StickyObserver?.disconnect();
  const card = document.getElementById('p5-filters-card');
  const sentinel = document.getElementById('p5-sticky-sentinel');
  if (!card || !sentinel || !stickyFiltersEnabled()) {
    card?.classList.remove('has-scroll-shadow');
    return;
  }
  p5StickyObserver = new IntersectionObserver(
    ([entry]) => {
      card.classList.toggle('has-scroll-shadow', !entry.isIntersecting);
    },
    { threshold: [0] },
  );
  p5StickyObserver.observe(sentinel);
}

function readFiltersFromDom() {
  pageFilters = {
    status: document.getElementById('p5-filter-status')?.value ?? 'Ativo',
    programa: document.getElementById('p5-filter-programa')?.value ?? 'all',
    ep: document.getElementById('p5-filter-ep')?.value ?? 'all',
    state: document.getElementById('p5-filter-state')?.value ?? 'all',
    region: document.getElementById('p5-filter-region')?.value ?? 'all',
    professionCategory: document.getElementById('p5-filter-prof-cat')?.value ?? 'all',
    profession: document.getElementById('p5-filter-profession')?.value ?? 'all',
    mechanism: document.getElementById('p5-filter-mech')?.value ?? 'all',
    mechanismCount: document.getElementById('p5-filter-mech-count')?.value ?? 'all',
    q: document.getElementById('p5-filter-q')?.value ?? '',
  };
}

function bindPromotores5Estrelas(root, filtered, allClients) {
  const rerender = () => {
    readFiltersFromDom();
    renderPromotores5Estrelas(root);
  };

  const exportRows = () => {
    readFiltersFromDom();
    return applyInternalAnalysisFilters(allClients, pageFilters);
  };

  for (const id of [
    'p5-filter-status',
    'p5-filter-programa',
    'p5-filter-ep',
    'p5-filter-state',
    'p5-filter-region',
    'p5-filter-prof-cat',
    'p5-filter-profession',
    'p5-filter-mech',
    'p5-filter-mech-count',
  ]) {
    document.getElementById(id)?.addEventListener('change', rerender);
  }
  let qTimer;
  document.getElementById('p5-filter-q')?.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(rerender, 250);
  });
  document.getElementById('p5-sticky-switch')?.addEventListener('change', (e) => {
    setStickyFiltersEnabled(e.target.checked);
    rerender();
  });
  document.getElementById('p5-clear-filters')?.addEventListener('click', () => {
    pageFilters = defaultPromotoresFilters();
    tablePage = 1;
    renderPromotores5Estrelas(root);
  });
  document.getElementById('p5-prev')?.addEventListener('click', () => {
    tablePage = Math.max(1, tablePage - 1);
    renderPromotores5Estrelas(root);
  });
  document.getElementById('p5-next')?.addEventListener('click', () => {
    tablePage += 1;
    renderPromotores5Estrelas(root);
  });

  document.getElementById('p5-export-csv')?.addEventListener('click', () => {
    const rows = exportRows();
    const stamp = exportDateStamp();
    const result = exportFilteredCsv({
      filename: `promotores_5_estrelas_${stamp}.csv`,
      columns: exportColumns(),
      rows,
    });
    if (result.ok) showPageToast(`CSV exportado com ${result.rows} clientes.`);
    else showPageToast('Nenhum cliente para exportar.', { variant: 'error' });
  });

  document.getElementById('p5-export-xlsx')?.addEventListener('click', async () => {
    const rows = exportRows();
    const stamp = exportDateStamp();
    try {
      const result = await exportFilteredXlsx({
        filename: `promotores_5_estrelas_${stamp}.xlsx`,
        columns: exportColumns(),
        rows,
      });
      if (result.ok) showPageToast(`Excel exportado com ${result.rows} clientes.`);
      else showPageToast('Nenhum cliente para exportar.', { variant: 'error' });
    } catch {
      showPageToast('Falha ao gerar Excel.', { variant: 'error' });
    }
  });

  document.querySelectorAll('#p5-table tbody tr[data-client-id]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = tr.getAttribute('data-client-id');
      openDrawer(allClients.find((c) => c.client_id === id));
    });
  });
  document.getElementById('p5-drawer-backdrop')?.addEventListener('click', closePromotoresDrawer);
}
