import {
  hasEpSummary,
  getEpSummary,
  getEpResponses,
  getCycleSummary,
  getCycles,
  getDataState,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import {
  filterEpSummaries,
  filterEpSummariesByClientFilters,
  sortEpSummariesByName,
  computeEpPageKpis,
  epQualityLabel,
  isClientRecorteActive,
} from '../data/store-core.mjs';
import { formatNps, formatPct, formatDeltaPts, formatDate, cycleStatusLabel } from '../utils/format.js';
import {
  epManagementStatus,
  formatEpDeltaBadge,
  sortEpForRanking,
  npsBarPercent,
  EP_STATUS,
} from '../data/ep-performance.mjs';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { closeDrawer as closeClientDrawer } from './movimento.js';
import { openEpDrawerFromUI, closeEpDrawerFromUI } from '../ui/ep-drawer.js';
import { renderDataSourceNotice } from '../ui/data-source-notice.mjs';

let bubbleChart = null;
let rankingSortMode = 'nps_desc';
let rankingPage = 1;
const RANKING_PAGE_SIZE = 6;
let tableState = { page: 1, pageSize: 25, sortKey: 'nps', sortDir: 'desc' };
/** Busca local da tabela — não usa filters.search global (evita zerar ranking/KPIs). */
let epTableSearch = '';
let tableController = null;

/** Ranking e gráfico: ciclo/EP/delta/base, sem busca nem recorte de cliente na agregação. */
function filtersForEpRanking(filters) {
  return {
    ...filters,
    search: '',
    category: '',
    scoreMin: '',
    scoreMax: '',
  };
}

function filtersForEpTable(filters) {
  return { ...filters, search: epTableSearch };
}

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
  let entries = filterEpSummaries(allEntries, filtersForEpTable(filters));
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
  return `<p class="note-muted filter-notice" role="note">O ranking e KPIs agregados por EP não aplicam filtros de categoria ou nota. A tabela reflete EPs com ao menos uma resposta no recorte.</p>`;
}

function statusPillClass(statusKey) {
  if (statusKey === EP_STATUS.STRONG) return 'ep-status-pill ep-status-pill--strong';
  if (statusKey === EP_STATUS.CRITICAL) return 'ep-status-pill ep-status-pill--critical';
  if (statusKey === EP_STATUS.BELOW_RISING || statusKey === EP_STATUS.ABOVE_FALLING) {
    return 'ep-status-pill ep-status-pill--attention';
  }
  return 'ep-status-pill';
}

function deltaClass(arrow) {
  if (arrow === '↑') return 'ep-ranking-delta ep-ranking-delta--up';
  if (arrow === '↓') return 'ep-ranking-delta ep-ranking-delta--down';
  return 'ep-ranking-delta ep-ranking-delta--flat';
}

function renderEpRanking(entries, overallNps, minSample) {
  const enriched = entries.map((e) => {
    const status = epManagementStatus(e, overallNps);
    return { ...e, _statusKey: status.key, _status: status };
  });
  const sorted = sortEpForRanking(enriched, rankingSortMode === 'attention' ? 'attention' : 'nps_desc');
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / RANKING_PAGE_SIZE));
  if (rankingPage > totalPages) rankingPage = totalPages;
  if (rankingPage < 1) rankingPage = 1;
  const start = (rankingPage - 1) * RANKING_PAGE_SIZE;
  const pageRows = sorted.slice(start, start + RANKING_PAGE_SIZE);
  const refPct = npsBarPercent(overallNps);
  const rangeFrom = total ? start + 1 : 0;
  const rangeTo = total ? Math.min(start + RANKING_PAGE_SIZE, total) : 0;

  const items = pageRows
    .map((e) => {
      const delta = formatEpDeltaBadge(e.delta_nps_paired);
      const barPct = npsBarPercent(e.nps);
      const pairedNote =
        e.paired_clients > 0
          ? `n=${e.valid_responses} · pareados=${e.paired_clients}`
          : `n=${e.valid_responses} · sem comparação histórica`;
      const sample = smallSampleBadge(e, minSample);
      return `<li class="ep-ranking-row ep-ranking-row--animate" role="button" tabindex="0" data-ep-id="${escapeAttr(e.ep_id ?? '')}" data-ep-name="${escapeAttr(e.ep_name)}" aria-label="Abrir detalhes ${escapeAttr(e.ep_name)}">
        <div class="ep-ranking-row__head">
          <p class="ep-ranking-row__name">${escapeHtml(e.ep_name)} ${sample}</p>
          <p class="ep-ranking-row__meta">${escapeHtml(pairedNote)}</p>
          <span class="${statusPillClass(e._statusKey)}" title="${escapeAttr(e._status.label)}">${escapeHtml(e._status.short === '—' ? e._status.label : e._status.short)}</span>
        </div>
        <div class="ep-ranking-bar-wrap" aria-hidden="true">
          <span class="ep-ranking-bar-ref" style="left:${refPct}%"></span>
          <span class="ep-ranking-bar-fill" style="width:${barPct}%"></span>
        </div>
        <div class="ep-ranking-row__stats">
          <div class="ep-ranking-nps">${escapeHtml(formatNps(e.nps))}</div>
          <span class="${deltaClass(delta.arrow)}" title="${escapeAttr(delta.title)}">${escapeHtml(delta.text)}</span>
        </div>
      </li>`;
    })
    .join('');

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(
      (p) =>
        `<button type="button" class="ep-ranking-pager__page${p === rankingPage ? ' is-active' : ''}" data-page="${p}" aria-label="Página ${p}" aria-current="${p === rankingPage ? 'page' : 'false'}">${p}</button>`,
    )
    .join('');

  return `
    <div class="section-head">
      <h2 class="section-title">Desempenho por Engenheiro Patrimonial</h2>
      <p class="section-subtitle">Barras = NPS atual (−100 a +100). Linha coral = NPS geral do ciclo. Δ = mesmos clientes nos dois períodos.</p>
    </div>
    <div class="ep-ranking-toolbar">
      <label>Ordenar
        <select class="select-input" id="ep-ranking-sort" aria-label="Ordenação do ranking">
          <option value="nps_desc" ${rankingSortMode === 'nps_desc' ? 'selected' : ''}>NPS atual (maior primeiro)</option>
          <option value="attention" ${rankingSortMode === 'attention' ? 'selected' : ''}>Prioridade de atenção</option>
        </select>
      </label>
      <span class="note-muted">NPS geral: <strong>${escapeHtml(formatNps(overallNps))}</strong></span>
    </div>
    <div class="ep-ranking-pager-wrap">
      <button type="button" class="ep-ranking-pager__side ep-ranking-pager__side--prev" id="ep-ranking-side-prev" aria-label="Página anterior" ${rankingPage <= 1 ? 'disabled' : ''}>‹</button>
      <div class="ep-ranking-pager__main">
        <ul class="ep-ranking-list" id="ep-ranking-list">${items || '<li class="placeholder-note">Nenhuma carteira neste recorte.</li>'}</ul>
        <nav class="ep-ranking-pager" aria-label="Paginação do ranking de EP">
          <button type="button" class="ep-ranking-pager__btn ep-ranking-pager__btn--primary" id="ep-ranking-prev" ${rankingPage <= 1 ? 'disabled' : ''}>← Anterior</button>
          <div class="ep-ranking-pager__center">
            <span class="ep-ranking-pager__meta">Mostrando ${rangeFrom}–${rangeTo} de ${total} engenheiros · Página ${rankingPage} de ${totalPages}</span>
            <div class="ep-ranking-pager__pages" role="group" aria-label="Número da página">${pageButtons}</div>
          </div>
          <button type="button" class="ep-ranking-pager__btn ep-ranking-pager__btn--primary" id="ep-ranking-next" ${rankingPage >= totalPages ? 'disabled' : ''}>Próxima →</button>
        </nav>
      </div>
      <button type="button" class="ep-ranking-pager__side ep-ranking-pager__side--next" id="ep-ranking-side-next" aria-label="Próxima página" ${rankingPage >= totalPages ? 'disabled' : ''}>›</button>
    </div>`;
}

function refreshRankingHost(entries, signal) {
  const host = document.getElementById('ep-ranking-host');
  const summary = getCycleSummary(getFilters().cycleCode);
  if (!host) return;
  host.innerHTML = renderEpRanking(
    filterEpSummaries(entries, filtersForEpRanking(getFilters())),
    summary?.nps,
    getDataState()?.epSummaryDoc?.min_ep_sample ?? 5,
  );
  bindRanking(entries, signal);
}

function bindRanking(entries, signal) {
  document.getElementById('ep-ranking-sort')?.addEventListener(
    'change',
    (ev) => {
      rankingSortMode = ev.target.value;
      rankingPage = 1;
      refreshRankingHost(entries, signal);
    },
    { signal },
  );
  document.getElementById('ep-ranking-prev')?.addEventListener(
    'click',
    () => {
      if (rankingPage > 1) {
        rankingPage -= 1;
        refreshRankingHost(entries, signal);
      }
    },
    { signal },
  );
  document.getElementById('ep-ranking-next')?.addEventListener(
    'click',
    () => {
      rankingPage += 1;
      refreshRankingHost(entries, signal);
    },
    { signal },
  );
  const goPage = (p) => {
    rankingPage = p;
    refreshRankingHost(entries, signal);
  };
  document.getElementById('ep-ranking-side-prev')?.addEventListener('click', () => {
    if (rankingPage > 1) goPage(rankingPage - 1);
  }, { signal });
  document.getElementById('ep-ranking-side-next')?.addEventListener('click', () => {
    goPage(rankingPage + 1);
  }, { signal });
  document.querySelectorAll('.ep-ranking-pager__page').forEach((btn) => {
    btn.addEventListener('click', () => goPage(Number(btn.dataset.page) || 1), { signal });
  });
  document.querySelectorAll('.ep-ranking-row[data-ep-name]').forEach((row) => {
    const epName = row.dataset.epName;
    const epId = row.dataset.epId;
    const entry = entries.find((e) => e.ep_name === epName && (epId ? e.ep_id === epId : true));
    const open = () => entry && openEpDrawer(entry);
    row.addEventListener('click', open, { signal });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    }, { signal });
  });
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
  const searchVal = escapeAttr(epTableSearch);

  const overallNps = getCycleSummary(getFilters().cycleCode)?.nps;

  const body = pageRows
    .map((e) => {
      const status = epManagementStatus(e, overallNps);
      const clients = e.eligible_clients ?? '—';
      return `<tr data-ep-id="${escapeAttr(e.ep_id ?? '')}" data-ep-name="${escapeAttr(e.ep_name)}" tabindex="0">
        <td class="col-label">${escapeHtml(e.ep_name)} ${smallSampleBadge(e, minSample)}</td>
        <td class="num col-number">${clients}</td>
        <td class="num col-number">${e.valid_responses}</td>
        <td class="num col-number">${escapeHtml(formatNps(e.nps))}</td>
        <td class="num col-number">${e.paired_clients > 0 ? escapeHtml(formatNps(e.previous_nps_paired)) : '—'}</td>
        <td class="num col-number">${e.paired_clients > 0 ? escapeHtml(formatDeltaPts(e.current_nps_paired, e.previous_nps_paired)) : 'Sem comparação'}</td>
        <td class="col-small"><span class="${statusPillClass(status.key)}" title="${escapeAttr(status.label)}">${escapeHtml(status.label)}</span></td>
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
          <th class="num col-number" data-sort="eligible_clients" scope="col">Clientes</th>
          <th class="num col-number" data-sort="valid_responses" scope="col">Respostas</th>
          <th class="num col-number" data-sort="nps" scope="col">NPS atual</th>
          <th class="num col-number" scope="col">NPS anterior pareado</th>
          <th class="num col-number" data-sort="delta_nps_paired" scope="col">Δ</th>
          <th class="col-small" scope="col">Status</th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="7"><span class="placeholder-note">Nenhuma carteira neste recorte.</span></td></tr>'}</tbody>
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

function bindTable(allEntries, minSample, signal, cycleCode) {
  const tableSignal = beginTableBindings();
  const opts = { signal: tableSignal };
  const rerender = () => {
    const host = document.getElementById('eps-table-host');
    if (host) {
      const tableEntries = resolveTableEntries(cycleCode, getFilters(), allEntries);
      host.innerHTML = renderEpTable(tableEntries, minSample, getFilters());
      bindTable(allEntries, minSample, signal, cycleCode);
    }
  };
  const entries = resolveTableEntries(cycleCode, getFilters(), allEntries);

  document.getElementById('search-eps')?.addEventListener(
    'input',
    (e) => {
      epTableSearch = e.target.value ?? '';
      tableState.page = 1;
      rerender();
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
  rankingPage = 1;
  epTableSearch = '';
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

  const bubbleEntries = filterEpSummaries(allEntries, filtersForEpRanking(filters));

  root.innerHTML = `
    ${renderHero(cycle, summary)}
    ${renderDataSourceNotice('eps')}
    ${renderBaseNote(filters)}
    ${renderFilterNotice(filters)}
    ${renderKpis(kpis, minSample)}
    <div id="ep-ranking-host">${renderEpRanking(bubbleEntries, summary?.nps, minSample)}</div>
    <h2 class="section-title">Detalhe por carteira</h2>
    <p class="note-muted">Clique na linha para abrir o painel do EP.</p>
    <div id="eps-table-host"></div>
    <details class="ep-advanced-panel">
      <summary>Análise avançada — dispersão por carteira</summary>
      <p class="note-muted">Cada bolha é um EP. Tamanho ∝ n. Δ pareado nulo não entra no gráfico.</p>
      <article class="chart-card"><div class="chart-wrap chart-wrap--tall"><canvas id="chart-ep-bubble" aria-label="Dispersão NPS por EP"></canvas></div></article>
      ${renderNoCompareList(allEntries)}
    </details>
  `;

  document.getElementById('eps-table-host').innerHTML = renderEpTable(tableEntries, minSample, filters);
  bindTable(allEntries, minSample, signal, cycleCode);
  bindRanking(bubbleEntries, signal);

  const canvas = document.getElementById('chart-ep-bubble');
  const mountAdvancedChart = () => {
    if (!canvas || bubbleChart) return;
    mountBubbleChart(canvas, bubbleEntries, summary?.nps);
  };
  mountAdvancedChart();
  document.querySelector('.ep-advanced-panel')?.addEventListener('toggle', (ev) => {
    if (ev.target.open) mountAdvancedChart();
  }, { signal });

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
