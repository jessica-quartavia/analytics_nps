import {
  hasEpSummary,
  getEpSummary,
  getEpResponses,
  getCycleSummary,
  getCycles,
  getDataState,
} from '../data/analytics-store.js';
import { getFilters, setFilter } from '../filters/global-filters.js';
import {
  filterEpSummaries,
  filterEpSummariesByClientFilters,
  sortEpSummariesByName,
  computeEpPageKpis,
  epQualityLabel,
  isClientRecorteActive,
} from '../data/store-core.mjs';
import { formatNps, formatPct, formatDeltaPts, formatDate, cycleStatusLabel } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { closeDrawer as closeClientDrawer } from './movimento.js';
import { openEpDrawerFromUI, closeEpDrawerFromUI } from '../ui/ep-drawer.js';

let bubbleChart = null;
let tableState = { page: 1, pageSize: 25, sortKey: 'ep_name', sortDir: 'asc' };
let tableController = null;

function beginTableBindings() {
  tableController?.abort();
  tableController = new AbortController();
  return tableController.signal;
}

function destroyBubbleChart() {
  bubbleChart?.destroy();
  bubbleChart = null;
}

function clientFilterActive(filters) {
  return (
    isClientRecorteActive(filters) &&
    (filters.category ||
      filterFieldActive(filters.scoreMin) ||
      filterFieldActive(filters.scoreMax))
  );
}

function filterFieldActive(value) {
  return value != null && value !== '';
}

function resolveTableEntries(cycleCode, filters, allEntries) {
  let entries = filterEpSummaries(allEntries, filters);
  entries = filterEpSummariesByClientFilters(
    entries,
    getEpResponses(cycleCode),
    cycleCode,
    filters,
  );
  if (filters.base === 'paired') {
    entries = entries.filter((e) => e.paired_clients > 0);
  }
  return entries;
}

function smallSampleBadge(entry, minSample) {
  if (entry.valid_responses > 0 && entry.valid_responses < minSample) {
    return '<span class="badge badge--method" title="Amostra abaixo do limiar metodológico">Amostra pequena</span>';
  }
  return '';
}

function epReconstructBadge(entry) {
  if ((entry.ep_low_confidence ?? 0) <= 0) return '';
  const n = entry.ep_low_confidence;
  const total = entry.valid_responses;
  const pct = total ? formatPct((n / total) * 100, 1) : '—';
  return `<span class="badge badge--method" title="Parte das respostas foi associada ao EP atual por ausência de histórico suficiente na data da pesquisa.">EP aproximado</span> <span class="note-muted">${n} de ${total} (${pct})</span>`;
}

function renderHero(cycle, summary) {
  const dataState = getDataState();
  const cutoff = formatDate(summary?.data_cutoff ?? dataState?.dataCutoff);
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Carteiras</p>
        <h1 class="hero__title">Engenheiros Patrimoniais</h1>
        <p class="page-header__lead">Compara as carteiras dos engenheiros patrimoniais com foco em amostra, variação e sinais de atenção.</p>
      </div>
      <div class="chip-row">
        <span class="chip-modern">${escapeHtml(cycle?.cycle_name ?? '—')}</span>
        <span class="chip-modern">${escapeHtml(cycleStatusLabel(summary?.status))}</span>
        <span class="chip-modern">Atualizado ${escapeHtml(cutoff)}</span>
      </div>
    </header>`;
}

function renderKpis(kpis, minSample) {
  return `
    <div class="metric-compact-grid">
      <article class="metric-compact"><div class="metric-compact__label">EPs com respostas</div><div class="metric-compact__value">${escapeHtml(String(kpis.epsWithResponses))}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Respostas válidas</div><div class="metric-compact__value">${escapeHtml(String(kpis.validResponses))}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Amostras pequenas</div><div class="metric-compact__value">${escapeHtml(String(kpis.smallSampleEps))}</div><div class="metric-compact__note">n &lt; ${minSample}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Qualidade metodológica</div><div class="metric-compact__value">${escapeHtml(formatPct(kpis.lowConfidencePct, 1))}</div><div class="metric-compact__note">${escapeHtml(String(kpis.lowConfidenceResponses))} respostas com EP aproximado</div></article>
    </div>`;
}

function renderBaseNote(filters) {
  const label = filters.base === 'paired' ? 'Mesmos clientes' : 'Base total';
  return `<p class="meta-pill" role="status">Visão: <strong>${escapeHtml(label)}</strong></p>`;
}

function renderFilterNotice(filters) {
  if (!clientFilterActive(filters)) return '';
  return `<p class="note-muted filter-notice" role="note">A dispersão e KPIs agregados por EP não aplicam filtros de categoria ou nota. A tabela reflete EPs com ao menos uma resposta no recorte.</p>`;
}

function mountBubbleChart(canvas, entries, cycleNps) {
  const points = [];
  const entryByPoint = [];
  for (const e of entries) {
    if (e.delta_nps_paired == null || e.nps == null) continue;
    const r = Math.max(4, Math.sqrt(e.valid_responses) * 3);
    points.push({
      x: e.delta_nps_paired,
      y: e.nps,
      r,
    });
    entryByPoint.push(e);
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const padX = 5;
  const minX = xs.length ? Math.min(...xs, -padX) - padX : -10;
  const maxX = xs.length ? Math.max(...xs, padX) + padX : 10;
  const minY = ys.length ? Math.min(...ys, 0) - 10 : -20;
  const maxY = ys.length ? Math.max(...ys, 100) + 10 : 100;

  const coral = getComputedStyle(document.documentElement).getPropertyValue('--color-coral').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim();

  bubbleChart = new Chart(canvas, {
    type: 'bubble',
    data: {
      datasets: [
        {
          label: 'Carteiras',
          data: points,
          backgroundColor: `${coral}99`,
          borderColor: coral,
        },
        {
          type: 'line',
          label: 'NPS geral',
          data: [
            { x: minX, y: cycleNps ?? 0 },
            { x: maxX, y: cycleNps ?? 0 },
          ],
          borderColor: muted,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          type: 'line',
          label: 'Δ pareado = 0',
          data: [
            { x: 0, y: minY },
            { x: 0, y: maxY },
          ],
          borderColor: muted,
          borderDash: [2, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 12 },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.datasetIndex !== 0) return '';
              const e = entryByPoint[ctx.dataIndex];
              if (!e) return '';
              return [
                e.ep_name,
                `NPS atual: ${formatNps(e.nps)}`,
                `NPS pareado ant.: ${formatNps(e.previous_nps_paired)}`,
                `NPS pareado at.: ${formatNps(e.current_nps_paired)}`,
                `Δ pareado: ${formatDeltaPts(e.current_nps_paired, e.previous_nps_paired)}`,
                `n: ${e.valid_responses}`,
                `Pareados: ${e.paired_clients}`,
                `IC95: ${formatNps(e.nps_ci_low)} – ${formatNps(e.nps_ci_high)}`,
                `Taxa: ${e.response_rate != null ? formatPct(e.response_rate * 100, 1) : '—'}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Δ NPS pareado' },
          ticks: { maxRotation: 0 },
        },
        y: { title: { display: true, text: 'NPS atual' } },
      },
      onClick(_evt, elements) {
        if (!elements.length) return;
        const idx = elements[0].index;
        const dsIdx = elements[0].datasetIndex;
        if (dsIdx !== 0) return;
        const ep = entryByPoint[idx];
        if (ep) openEpDrawer(ep);
      },
    },
  });
}

function renderNoCompareList(entries) {
  const list = entries.filter((e) => e.delta_nps_paired == null && e.valid_responses > 0);
  if (!list.length) return '';
  return `
    <h3 class="section-title">Sem base comparável</h3>
    <p class="note-muted">Carteiras sem Δ pareado (sem ciclo anterior ou sem clientes pareados nesta carteira):</p>
    <ul>${list.map((e) => `<li>${escapeHtml(e.ep_name)} (n=${e.valid_responses})</li>`).join('')}</ul>`;
}

function sortTableEntries(entries, key, dir) {
  const mul = dir === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    if (key === 'ep_name') {
      return (a.ep_name ?? '').localeCompare(b.ep_name ?? '', 'pt-BR') * mul;
    }
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv, 'pt-BR') * mul;
    return (av - bv) * mul;
  });
}

function renderEpTable(entries, minSample, filters) {
  const sorted =
    tableState.sortKey === 'ep_name' && tableState.sortDir === 'asc'
      ? sortEpSummariesByName(entries, 'asc')
      : sortTableEntries(entries, tableState.sortKey, tableState.sortDir);

  const totalPages = Math.max(1, Math.ceil(sorted.length / tableState.pageSize));
  if (tableState.page > totalPages) tableState.page = totalPages;
  const start = (tableState.page - 1) * tableState.pageSize;
  const pageRows = sorted.slice(start, start + tableState.pageSize);
  const searchVal = escapeAttr(getFilters().search);

  const body = pageRows
    .map((e) => {
      const rr =
        e.response_rate != null ? formatPct(e.response_rate * 100, 1) : '—';
      const ci =
        e.nps_ci_low != null ? `${formatNps(e.nps_ci_low)}\u2013${formatNps(e.nps_ci_high)}` : '—';
      return `<tr data-ep-id="${escapeAttr(e.ep_id ?? '')}" data-ep-name="${escapeAttr(e.ep_name)}" tabindex="0">
        <td class="col-label">${escapeHtml(e.ep_name)} ${smallSampleBadge(e, minSample)}</td>
        <td class="num col-number">${escapeHtml(formatNps(e.nps))}</td>
        <td class="num col-number">${escapeHtml(formatNps(e.previous_nps_paired))}</td>
        <td class="num col-number">${escapeHtml(formatDeltaPts(e.current_nps_paired, e.previous_nps_paired))}</td>
        <td class="num col-number">${e.valid_responses}</td>
        <td class="num col-number">${e.promoters}</td>
        <td class="num col-number">${e.detractors}</td>
        <td class="num col-number">${escapeHtml(rr)}</td>
        <td class="num col-number cell-nowrap">${escapeHtml(ci)}</td>
        <td class="num col-number">${e.paired_clients}</td>
        <td class="col-small">${escapeHtml(epQualityLabel(e))} ${epReconstructBadge(e)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="table-toolbar">
      <label class="sr-only" for="search-eps">Buscar EP</label>
      <input class="text-input" id="search-eps" type="search" placeholder="Nome, código ou ID" value="${searchVal}" aria-label="Buscar por nome, código ou ID" />
      <label>Por página
        <select class="select-input" id="ep-page-size" aria-label="Itens por página">
          ${[25, 50, 100].map((n) => `<option value="${n}" ${tableState.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="table-wrap">
      <table class="gd-table analytic-table" id="eps-table">
        <thead><tr>
          <th class="col-label" data-sort="ep_name" scope="col">EP</th>
          <th class="num col-number" data-sort="nps" scope="col">NPS atual</th>
          <th class="num col-number" scope="col">NPS anterior pareado</th>
          <th class="num col-number" data-sort="delta_nps_paired" scope="col">Δ pareado</th>
          <th class="num col-number" data-sort="valid_responses" scope="col">n</th>
          <th class="num col-number" scope="col">Promotores</th>
          <th class="num col-number" scope="col">Detratores</th>
          <th class="num col-number" scope="col">Taxa de resposta</th>
          <th class="num col-number" scope="col">IC95</th>
          <th class="num col-number" data-sort="paired_clients" scope="col">Pareados</th>
          <th class="col-small" scope="col">Qualidade EP</th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="11"><span class="placeholder-note">Nenhuma carteira neste recorte.</span></td></tr>'}</tbody>
      </table>
    </div>
    <div class="pagination">
      <span>${sorted.length} carteiras · página ${tableState.page}/${totalPages}</span>
      <span>
        <button type="button" class="chip" id="ep-page-prev" ${tableState.page <= 1 ? 'disabled' : ''}>Anterior</button>
        <button type="button" class="chip" id="ep-page-next" ${tableState.page >= totalPages ? 'disabled' : ''}>Próxima</button>
      </span>
    </div>`;
}

export function closeEpDrawer() {
  closeEpDrawerFromUI();
}

function openEpDrawer(entry) {
  closeClientDrawer();
  const filters = getFilters();
  const cycleCode = filters.cycleCode;
  const minSample = getDataState()?.epSummaryDoc?.min_ep_sample ?? 5;
  openEpDrawerFromUI(entry, { cycleCode, filters, minSample });
}

function bindTable(entries, minSample, signal) {
  const tableSignal = beginTableBindings();
  const opts = { signal: tableSignal };
  const rerender = () => {
    const host = document.getElementById('eps-table-host');
    if (host) {
      host.innerHTML = renderEpTable(entries, minSample, getFilters());
      bindTable(entries, minSample, signal);
    }
  };

  document.getElementById('search-eps')?.addEventListener(
    'input',
    (e) => {
      setFilter('search', e.target.value);
      tableState.page = 1;
    },
    opts,
  );

  document.getElementById('ep-page-size')?.addEventListener(
    'change',
    (e) => {
      tableState.pageSize = Number(e.target.value);
      tableState.page = 1;
      rerender();
    },
    opts,
  );
  document.getElementById('ep-page-prev')?.addEventListener(
    'click',
    () => {
      tableState.page -= 1;
      rerender();
    },
    opts,
  );
  document.getElementById('ep-page-next')?.addEventListener(
    'click',
    () => {
      tableState.page += 1;
      rerender();
    },
    opts,
  );
  document.querySelectorAll('#eps-table th[data-sort]').forEach((th) => {
    th.addEventListener(
      'click',
      () => {
        const key = th.dataset.sort;
        if (tableState.sortKey === key) tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          tableState.sortKey = key;
          tableState.sortDir = key === 'ep_name' ? 'asc' : 'desc';
        }
        rerender();
      },
      opts,
    );
  });
  document.querySelectorAll('#eps-table tbody tr[data-ep-name]').forEach((tr) => {
    const epName = tr.dataset.epName;
    const epId = tr.dataset.epId;
    const entry = entries.find((e) => e.ep_name === epName && (epId ? e.ep_id === epId : true));
    tr.addEventListener('click', () => entry && openEpDrawer(entry), opts);
    tr.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          entry && openEpDrawer(entry);
        }
      },
      opts,
    );
  });
}

export function renderEps(root, ctx = {}) {
  destroyBubbleChart();
  closeEpDrawer();
  const signal = ctx.signal;

  if (!hasEpSummary()) {
    root.innerHTML = `<div class="gd-status gd-status--error" role="status"><p>Os dados por EP ainda não foram gerados. Execute o refresh do NPS.</p></div>`;
    return;
  }

  const filters = getFilters();
  const cycleCode = filters.cycleCode;
  const cycle = getCycles().find((c) => c.cycle_code === cycleCode);
  const summary = getCycleSummary(cycleCode);
  const minSample = getDataState()?.epSummaryDoc?.min_ep_sample ?? 5;

  let allEntries = getEpSummary(cycleCode).filter((e) => e.valid_responses > 0);
  if (!allEntries.length) {
    root.innerHTML = `
      ${renderHero(cycle, summary)}
      <div class="gd-status" role="status"><p>Nenhuma carteira com respostas neste ciclo.</p></div>`;
    return;
  }

  const tableEntries = resolveTableEntries(cycleCode, filters, allEntries);
  const kpiEntries = filters.ep
    ? filterEpSummaries(allEntries, filters)
    : clientFilterActive(filters)
      ? filterEpSummariesByClientFilters(allEntries, getDataState()?.responses ?? [], cycleCode, filters)
      : allEntries;
  const kpis = computeEpPageKpis(kpiEntries, minSample);

  const bubbleEntries = filterEpSummaries(allEntries, {
    ...filters,
    category: '',
    scoreMin: '',
    scoreMax: '',
  });

  root.innerHTML = `
    ${renderHero(cycle, summary)}
    ${renderBaseNote(filters)}
    ${renderFilterNotice(filters)}
    ${renderKpis(kpis, minSample)}
    <h2 class="section-title">Dispersão por carteira</h2>
    <p class="note-muted">Cada bolha é um EP. Tamanho ∝ n. Clique para detalhes. Δ pareado nulo não entra no gráfico.</p>
    <article class="chart-card"><div class="chart-wrap chart-wrap--tall"><canvas id="chart-ep-bubble" aria-label="Dispersão NPS por EP"></canvas></div></article>
    ${renderNoCompareList(allEntries)}
    <h2 class="section-title">Carteiras</h2>
    <div id="eps-table-host"></div>
  `;

  document.getElementById('eps-table-host').innerHTML = renderEpTable(tableEntries, minSample, filters);
  bindTable(tableEntries, minSample, signal);

  const canvas = document.getElementById('chart-ep-bubble');
  if (canvas) {
    mountBubbleChart(canvas, bubbleEntries, summary?.nps);
  }

  if (signal) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          closeEpDrawer();
          closeClientDrawer();
        }
      },
      { signal },
    );
  }
}
