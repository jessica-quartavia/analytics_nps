import {
  getHistorico2Doc,
  getNpsMeasurementsBaseQvDoc,
  getNpsMeasurementsConsolidatedDoc,
  getDataState,
  getHistoricalNpsEnriched,
  getHistoricalNpsSummary,
  getCurrentOfficialNpsState,
  getExecutivePreviousOfficialSummary,
  getCycles,
  getCycleSummary,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatNps, formatDate, formatPct } from '../utils/format.js';
import { historicoKpiCard } from './historico-nps-render.mjs';
import { buildHistorico2ExecutiveKpis } from '../data/historico2-executive-kpis.mjs';
import { buildMeasurementChartSeriesForPage } from '../data/nps-historico-measurements-view.mjs';
import { helpTip } from '../ui/help.js';
import {
  defaultHistorico2Filters,
  hasExplicitHistorico2Filters,
  filterHistorico2Clients,
  buildHistorico2ViewModel,
  distinctOptions,
  safraFilterOptions,
  filterChipList,
  sortClients,
  displaySafra,
  cohortSort,
  COHORT_NO_ENTRY,
  COHORT_NO_ENTRY_LABEL,
  ENTRY_YEAR_2025_PLUS,
  ENTRY_YEAR_ALL,
  ENTRY_YEAR_NO_DATE,
  historico2StickyEnabled,
  setHistorico2StickyEnabled,
  clientDisplayName,
} from '../data/historico2-view.mjs';
import { renderHistorico2Pagination } from '../ui/historico2-pagination.mjs';

const COLORS = {
  promoter: 'rgba(22, 101, 52, 0.85)',
  passive: 'rgba(100, 116, 139, 0.75)',
  detractor: 'rgba(200, 74, 42, 0.85)',
  npsLine: 'rgba(232, 93, 76, 1)',
  npsFill: 'rgba(232, 93, 76, 0.12)',
  clientsBar: 'rgba(37, 99, 235, 0.55)',
  avgLine: 'rgba(22, 101, 52, 1)',
  responsesLine: 'rgba(232, 93, 76, 1)',
  responsesFill: 'rgba(232, 93, 76, 0.1)',
};

let chartInstances = [];
let pageFilters = defaultHistorico2Filters();
let tablePage = 1;
let epPage = 1;
const EXPLORER_PAGE_SIZE = 20;
const EP_PAGE_SIZE = 10;
let sortKey = 'name';
let sortDir = 'asc';
/** @type {HTMLElement | null} */
let pageRoot = null;

function destroyCharts() {
  for (const c of chartInstances) c.destroy();
  chartInstances = [];
}

function badgeCategory(cat) {
  if (!cat) return '—';
  const c = String(cat).toLowerCase();
  let cls = 'badge--neutral-soft';
  if (c.includes('promot')) cls = 'badge--promoter';
  else if (c.includes('detrat')) cls = 'badge--detractor';
  else if (c.includes('neutr')) cls = 'badge--passive';
  return `<span class="badge ${cls}">${escapeHtml(cat)}</span>`;
}

function renderSourceBanner() {
  return `<section class="historico2-info-grid" aria-label="Metodologia e fontes">
    <article class="card historico2-info-card">
      <div class="historico2-info-card__head">
        <span class="historico2-info-card__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>
        </span>
        <h2 class="historico2-info-card__title">Fontes utilizadas</h2>
      </div>
      <div class="historico2-info-card__badges">
        <span class="badge badge--method">BASE QV</span>
        <span class="badge badge--neutral-soft">Business Data · NPS Histórico</span>
        <span class="badge badge--neutral-soft">Business Data · BASE0</span>
      </div>
      <p class="historico2-info-card__text">Os dados atuais de NPS vêm da BASE QV. As medições históricas anteriores disponíveis apenas na base consolidada vêm do histórico oficial do NPS. O BASE0 é utilizado exclusivamente para recuperar a data de entrada e calcular a safra.</p>
    </article>
    <article class="card historico2-info-card">
      <h2 class="historico2-info-card__title">Como os dados são cruzados</h2>
      <p class="historico2-info-card__text">Para localizar a data de entrada no BASE0, o sistema tenta o cruzamento nesta ordem: ID BASE QV, CPF, e-mail e telefone. Quando não há correspondência, o cliente continua normalmente na análise com dados da BASE QV, apenas sem data de entrada e safra.</p>
      <details class="historico2-info-card__details">
        <summary>Colunas usadas no match</summary>
        <dl class="method-dl method-dl--compact">
          <dt>BASE QV</dt><dd><code>clients.id</code>, identificadores enriquecidos (<code>cpf</code>, <code>email</code>, <code>telefone</code> via pipeline)</dd>
          <dt>BASE0 · clientes</dt><dd><code>base_qv_id</code>, <code>cpf_norm</code>, <code>email_norm</code>, <code>telefone_norm</code>, <code>data_entrada</code></dd>
        </dl>
      </details>
    </article>
  </section>`;
}

function renderExecutiveKpis(exec, matchQuality) {
  const tenureVal =
    exec.tenureMedianMonths != null ? `${Math.round(exec.tenureMedianMonths * 10) / 10} meses` : '—';
  const meetVal =
    exec.meetingsMedian != null ? String(Math.round(exec.meetingsMedian * 10) / 10) : '—';
  return `<section class="historico-kpi-grid historico2-executive-kpis" aria-label="Indicadores">
    ${historicoKpiCard(
      'NPS oficial atual',
      exec.officialNps != null ? formatNps(exec.officialNps) : '—',
      exec.officialCycleLabel ?? '—',
    )}
    ${historicoKpiCard(
      'Variação',
      exec.variation != null ? formatNps(exec.variation) : '—',
      'vs medição anterior',
      'historico-kpi-card--variation',
    )}
    ${historicoKpiCard(
      'Respostas do ciclo atual',
      String(exec.cycleResponses ?? 0),
      exec.currentCanonical ? `ciclo ${exec.currentCanonical}` : 'metodologia Executivo',
    )}
    ${historicoKpiCard(
      'Clientes únicos históricos',
      exec.uniqueHistoricalClients != null ? String(exec.uniqueHistoricalClients) : '—',
      'consolidado dedupe',
    )}
    ${historicoKpiCard(
      'Clientes recorrentes',
      exec.recurringClients != null ? String(exec.recurringClients) : '—',
      '2+ respostas',
    )}
    ${historicoKpiCard(
      'Mediana tempo de relacionamento',
      tenureVal,
      `n=${exec.tenureSampleN ?? 0} respostas PIT`,
    )}
    ${historicoKpiCard('Mediana reuniões (PIT)', meetVal, 'antes da resposta')}
    ${historicoKpiCard(
      '% c/ mecanismo na resposta',
      exec.mechanismPct != null ? formatPct(exec.mechanismPct) : '—',
      'somente data temporal conhecida',
    )}
  </section>
  <section class="card historico2-quality-card">
    <h2 class="section-title section-title--flush">Qualidade do cruzamento ${helpTip('BASE0 é usado apenas para recuperar data_entrada. O match prioriza base_qv_id, seguido de CPF, e-mail e telefone.')}</h2>
    <div class="historico2-quality-chips">
      <span class="historico2-mini-stat">ID <strong>${matchQuality.base_qv_id ?? 0}</strong></span>
      <span class="historico2-mini-stat">CPF <strong>${matchQuality.cpf ?? 0}</strong></span>
      <span class="historico2-mini-stat">Email <strong>${matchQuality.email ?? 0}</strong></span>
      <span class="historico2-mini-stat">Telefone <strong>${matchQuality.phone ?? 0}</strong></span>
      <span class="historico2-mini-stat historico2-mini-stat--muted" title="Clientes sem correspondência no BASE0 continuam na análise com dados da BASE QV; apenas sem data de entrada/safra.">Sem match ${helpTip('Clientes sem correspondência no BASE0 continuam integralmente na análise usando os dados da BASE QV; apenas não possuem data de entrada/safra.')} <strong>${matchQuality.unmatched ?? 0}</strong></span>
      <span class="historico2-mini-stat historico2-mini-stat--warn">Ambíguos <strong>${matchQuality.ambiguous ?? 0}</strong></span>
    </div>
  </section>`;
}

function renderFilters(allClients) {
  const { safras, hasNoEntry } = safraFilterOptions(allClients);
  const safras2025 = safras.filter((s) => Number(s.slice(0, 4)) >= 2025);
  const programs = distinctOptions(allClients, 'program');
  const eps = distinctOptions(allClients, 'ep');
  const statuses = distinctOptions(allClients, 'status');
  const stickyOn = historico2StickyEnabled();

  const opt = (value, label, selected) =>
    `<option value="${escapeAttr(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;

  const chips = filterChipList(pageFilters);
  const chipsHtml = chips.length
    ? `<div class="historico2-filter-chips">${chips
        .map(
          (c) =>
            `<button type="button" class="filter-chip" data-chip-key="${escapeAttr(c.key)}">${escapeHtml(c.label)}: ${escapeHtml(c.value)} ×</button>`,
        )
        .join('')}<button type="button" class="btn btn--ghost btn--sm" id="h2-clear-filters">Limpar filtros</button></div>`
    : '';

  return `<section class="card filters-panel historico2-filters-card ${stickyOn ? 'historico2-filters-card--sticky' : ''}" id="historico2-filters" aria-label="Filtros">
    <div class="historico2-filters-card__head">
      <span class="historico2-filters-card__title">Filtros</span>
      <div class="filter-sticky-toggle">
        <span class="filter-sticky-label">${helpTip('Fixar filtros', 'Mantém os filtros visíveis durante a rolagem.')}</span>
        <label class="switch" aria-label="Fixar filtros durante a rolagem">
          <input type="checkbox" id="h2-sticky-switch" ${stickyOn ? 'checked' : ''} />
          <span class="switch__track"></span>
          <span class="switch__thumb"></span>
        </label>
      </div>
    </div>
    <div class="historico2-filters__grid">
      <div class="filter-field"><label for="h2-cohort">Safra</label>
        <select id="h2-cohort" class="select-input" data-filter="cohort">
          ${opt('', 'Todas', !pageFilters.cohort)}
          ${safras2025.map((s) => opt(s, s, pageFilters.cohort === s)).join('')}
          ${hasNoEntry ? opt(COHORT_NO_ENTRY, COHORT_NO_ENTRY_LABEL, pageFilters.cohort === COHORT_NO_ENTRY) : ''}
        </select>
      </div>
      <div class="filter-field"><label for="h2-entry-year">Ano de entrada</label>
        <select id="h2-entry-year" class="select-input" data-filter="entryYear">
          ${opt(ENTRY_YEAR_ALL, 'Todos os anos', pageFilters.entryYear === ENTRY_YEAR_ALL)}
          ${opt(ENTRY_YEAR_2025_PLUS, '2025+', pageFilters.entryYear === ENTRY_YEAR_2025_PLUS)}
          ${opt('2025', '2025', pageFilters.entryYear === '2025')}
          ${opt('2026', '2026', pageFilters.entryYear === '2026')}
          ${opt(ENTRY_YEAR_NO_DATE, 'Sem data de entrada', pageFilters.entryYear === ENTRY_YEAR_NO_DATE)}
        </select>
      </div>
      <div class="filter-field"><label for="h2-program">Programa</label>
        <select id="h2-program" class="select-input" data-filter="program">
          ${opt('', 'Todos', !pageFilters.program)}
          ${programs.map((p) => opt(p, p, pageFilters.program === p)).join('')}
        </select>
      </div>
      <div class="filter-field"><label for="h2-ep">EP</label>
        <select id="h2-ep" class="select-input" data-filter="ep">
          ${opt('', 'Todos', !pageFilters.ep)}
          ${eps.map((p) => opt(p, p, pageFilters.ep === p)).join('')}
        </select>
      </div>
      <div class="filter-field"><label for="h2-status">Status</label>
        <select id="h2-status" class="select-input" data-filter="status">
          ${opt('', 'Todos', !pageFilters.status)}
          ${statuses.map((p) => opt(p, p, pageFilters.status === p)).join('')}
        </select>
      </div>
      <div class="filter-field"><label for="h2-nps-cat">Categoria NPS</label>
        <select id="h2-nps-cat" class="select-input" data-filter="npsCategory">
          ${opt('', 'Todas', !pageFilters.npsCategory)}
          ${opt('Promotor', 'Promotor', pageFilters.npsCategory === 'Promotor')}
          ${opt('Neutro', 'Neutro', pageFilters.npsCategory === 'Neutro')}
          ${opt('Detrator', 'Detrator', pageFilters.npsCategory === 'Detrator')}
        </select>
      </div>
      <div class="filter-field"><label for="h2-has-entry">Com data de entrada</label>
        <select id="h2-has-entry" class="select-input" data-filter="hasEntryDate">
          ${opt('', 'Todos', !pageFilters.hasEntryDate)}
          ${opt('yes', 'Sim', pageFilters.hasEntryDate === 'yes')}
          ${opt('no', 'Não', pageFilters.hasEntryDate === 'no')}
        </select>
      </div>
      <div class="filter-field historico2-filters__search"><label for="h2-search">Busca cliente</label>
        <input type="search" id="h2-search" class="select-input historico2-search-input" placeholder="Buscar por nome, e-mail ou ID" value="${escapeHtml(pageFilters.search)}" />
      </div>
      <details class="filter-field historico2-filters__advanced">
        <summary>Match data entrada (avançado)</summary>
        <select id="h2-match" class="select-input" data-filter="matchMethod">
          ${opt('', 'Todos', !pageFilters.matchMethod)}
          ${opt('base_qv_id', 'ID', pageFilters.matchMethod === 'base_qv_id')}
          ${opt('cpf', 'CPF', pageFilters.matchMethod === 'cpf')}
          ${opt('email', 'Email', pageFilters.matchMethod === 'email')}
          ${opt('phone', 'Telefone', pageFilters.matchMethod === 'phone')}
          ${opt('unmatched', 'Sem match', pageFilters.matchMethod === 'unmatched')}
          ${opt('ambiguous', 'Ambíguo', pageFilters.matchMethod === 'ambiguous')}
        </select>
      </details>
    </div>
    ${chipsHtml}
    <div id="historico2-filter-sentinel" class="historico2-filter-sentinel" aria-hidden="true"></div>
  </section>`;
}

function renderChartsSection() {
  return `<section class="historico2-charts-grid">
    <article class="card chart-card historico2-chart-card"><h2 class="section-title">NPS por safra (2025+)</h2><div class="chart-wrap historico2-chart-wrap"><canvas id="h2-chart-nps"></canvas></div></article>
    <article class="card chart-card historico2-chart-card"><h2 class="section-title">Clientes por safra</h2><div class="chart-wrap historico2-chart-wrap"><canvas id="h2-chart-clients"></canvas></div></article>
    <article class="card chart-card historico2-chart-card"><h2 class="section-title">Nota média por safra</h2><div class="chart-wrap historico2-chart-wrap"><canvas id="h2-chart-avg"></canvas></div></article>
    <article class="card chart-card historico2-chart-card"><h2 class="section-title">P/N/D por safra</h2><div class="chart-wrap historico2-chart-wrap"><canvas id="h2-chart-pnd"></canvas></div></article>
    <article class="card chart-card historico2-chart-card historico2-chart-card--wide"><h2 class="section-title">Respostas por medição</h2><p class="note-muted historico2-chart-subtitle">Quantidade de respostas NPS por medição, combinando o histórico oficial e os dados atuais da BASE QV.</p><div class="chart-wrap historico2-chart-wrap"><canvas id="h2-chart-responses"></canvas></div></article>
  </section>`;
}

/** Labels numéricos acima dos pontos (Chart.js plugin). */
function chartPointValueLabelsPlugin(getValue) {
  return {
    id: 'h2PointValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(51, 65, 85, 0.92)';
      ctx.textAlign = 'center';
      for (let i = 0; i < meta.data.length; i += 1) {
        const pt = meta.data[i];
        const raw = getValue(i, chart);
        if (raw == null || Number.isNaN(raw)) continue;
        const label = typeof raw === 'number' ? String(Math.round(raw)) : String(raw);
        ctx.fillText(label, pt.x, pt.y - 10);
      }
      ctx.restore();
    },
  };
}

function renderDimensionTable(title, rows) {
  if (!rows?.length) return '';
  return `<section class="card historico2-dim-table">
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <div class="table-wrap">
      <table class="data-table data-table--compact">
        <thead><tr><th>Nome</th><th>Clientes</th><th>Respostas</th><th>NPS</th><th>Nota média</th></tr></thead>
        <tbody>${rows
          .map(
            (r) =>
              `<tr><td class="historico2-cell-wrap">${escapeHtml(r.label)}</td><td>${r.clients}</td><td>${r.nps_responses}</td><td>${formatNps(r.nps)}</td><td>${r.average_score != null ? r.average_score.toFixed(1) : '—'}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function renderEpTable(rows) {
  if (!rows?.length) return '';
  const totalPages = Math.max(1, Math.ceil(rows.length / EP_PAGE_SIZE));
  if (epPage > totalPages) epPage = totalPages;
  const start = (epPage - 1) * EP_PAGE_SIZE;
  const pageRows = rows.slice(start, start + EP_PAGE_SIZE);
  return `<section class="card historico2-dim-table" id="historico2-ep-table">
    <h2 class="section-title">Por EP</h2>
    <div class="table-wrap">
      <table class="data-table data-table--compact">
        <thead><tr><th>EP</th><th>Clientes</th><th>Respostas</th><th>NPS</th><th>Nota média</th></tr></thead>
        <tbody>${pageRows
          .map(
            (r) =>
              `<tr><td class="historico2-cell-wrap historico2-cell-wrap--ep">${escapeHtml(r.label)}</td><td>${r.clients}</td><td>${r.nps_responses}</td><td>${formatNps(r.nps)}</td><td>${r.average_score != null ? r.average_score.toFixed(1) : '—'}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>
    ${renderHistorico2Pagination({
      page: epPage,
      totalPages,
      totalItems: rows.length,
      pageSize: EP_PAGE_SIZE,
      prevId: 'h2-ep-prev',
      nextId: 'h2-ep-next',
      unitLabel: 'EPs',
    })}
  </section>`;
}

function renderExplorer(clients) {
  const sorted = sortClients(clients, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / EXPLORER_PAGE_SIZE));
  if (tablePage > totalPages) tablePage = totalPages;
  const start = (tablePage - 1) * EXPLORER_PAGE_SIZE;
  const pageRows = sorted.slice(start, start + EXPLORER_PAGE_SIZE);

  const sortBtn = (key, label) => {
    const active = sortKey === key;
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<button type="button" class="historico2-sort-btn${active ? ' is-active' : ''}" data-sort="${key}">${escapeHtml(label)}${arrow}</button>`;
  };

  return `<section class="card historico2-explorer" id="historico2-explorer">
    <div class="historico2-explorer__head">
      <h2 class="section-title section-title--flush">Cliente Explorer</h2>
    </div>
    <div class="historico2-sort-row">${sortBtn('name', 'Cliente')} ${sortBtn('entry_date', 'Data entrada')} ${sortBtn('safra', 'Safra')} ${sortBtn('nps_score', 'Última nota')} ${sortBtn('nps_submitted_at', 'Última resposta')}</div>
    <div class="table-wrap">
      <table class="data-table data-table--compact">
        <thead><tr>
          <th>Cliente</th><th>Programa</th><th>EP</th><th>Status</th>
          <th>Data entrada</th><th>Safra</th><th>Última nota</th><th>Categoria</th>
          <th>Última resposta</th><th>Match</th>
        </tr></thead>
        <tbody>${pageRows
          .map(
            (c) => `<tr data-client-id="${escapeAttr(c.client_id)}" class="historico2-row" tabindex="0">
            <td class="historico2-cell-client">${escapeHtml(clientDisplayName(c))}</td>
            <td>${escapeHtml(c.program ?? '—')}</td>
            <td class="historico2-cell-wrap historico2-cell-wrap--ep">${escapeHtml(c.ep ?? '—')}</td>
            <td>${escapeHtml(c.status ?? '—')}</td>
            <td>${c.entry_date ? escapeHtml(formatDate(c.entry_date)) : '—'}</td>
            <td>${escapeHtml(displaySafra(c))}</td>
            <td>${c.nps_score != null ? escapeHtml(String(c.nps_score)) : '—'}</td>
            <td>${badgeCategory(c.nps_category)}</td>
            <td>${escapeHtml(formatDate(c.nps_submitted_at))}</td>
            <td><span class="badge badge--neutral-soft">${escapeHtml(c.match_method_label ?? '—')}</span></td>
          </tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>
    ${renderHistorico2Pagination({
      page: tablePage,
      totalPages,
      totalItems: sorted.length,
      pageSize: EXPLORER_PAGE_SIZE,
      prevId: 'h2-prev',
      nextId: 'h2-next',
      unitLabel: 'clientes',
    })}
  </section>`;
}

function clientNpsTimeline(clientId) {
  const rows = (getDataState()?.responses ?? [])
    .filter((r) => String(r.client_id) === String(clientId))
    .filter((r) => r.score != null && r.score !== '')
    .sort((a, b) => String(b.submitted_at ?? '').localeCompare(String(a.submitted_at ?? '')));
  if (!rows.length) return '<p class="note-muted">Nenhuma resposta NPS na BASE QV.</p>';
  return `<ul class="historico2-timeline">${rows
    .slice(0, 8)
    .map(
      (r) =>
        `<li><strong>${escapeHtml(String(r.score))}</strong> · ${badgeCategory(r.nps_category)} · ${escapeHtml(formatDate(r.submitted_at))} · ${escapeHtml(r.analytical_cycle_code ?? '—')}</li>`,
    )
    .join('')}</ul>`;
}

function openDrawer(client) {
  let el = document.getElementById('historico2-drawer');
  if (!el) {
    el = document.createElement('aside');
    el.id = 'historico2-drawer';
    el.className = 'historico2-drawer';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(el);
  }
  const noMatch = client.entry_date_match_method === 'unmatched' || !client.entry_date;
  const entryLabel = client.entry_date ? formatDate(client.entry_date) : 'Não localizada no BASE0';
  const safraLabel = client.entry_date ? displaySafra(client) : COHORT_NO_ENTRY_LABEL;
  const noMatchNote = noMatch
    ? `<p class="callout callout--neutral historico2-drawer-note">Não foi encontrada uma correspondência segura no BASE0. As informações exibidas permanecem integralmente provenientes da BASE QV.</p>`
    : '';

  el.innerHTML = `
    <div class="historico2-drawer__backdrop" id="h2-drawer-backdrop"></div>
    <div class="historico2-drawer__panel">
      <button type="button" class="historico2-drawer__close" id="h2-drawer-close" aria-label="Fechar">×</button>
      <h2>${escapeHtml(clientDisplayName(client))}</h2>
      ${noMatchNote}
      <h3 class="historico2-drawer__section">Resumo</h3>
      <dl class="method-dl">
        <dt>Programa</dt><dd>${escapeHtml(client.program ?? '—')}</dd>
        <dt>EP</dt><dd>${escapeHtml(client.ep ?? '—')}</dd>
        <dt>Status</dt><dd>${escapeHtml(client.status ?? '—')}</dd>
        <dt>Data de entrada</dt><dd>${escapeHtml(entryLabel)}</dd>
        <dt>Safra</dt><dd>${escapeHtml(safraLabel)}</dd>
      </dl>
      <h3 class="historico2-drawer__section">NPS (BASE QV)</h3>
      <dl class="method-dl">
        <dt>Última nota</dt><dd>${client.nps_score != null ? escapeHtml(String(client.nps_score)) : '—'}</dd>
        <dt>Categoria</dt><dd>${badgeCategory(client.nps_category)}</dd>
        <dt>Data</dt><dd>${escapeHtml(formatDate(client.nps_submitted_at))}</dd>
      </dl>
      ${clientNpsTimeline(client.client_id)}
      <h3 class="historico2-drawer__section">Origem</h3>
      <dl class="method-dl">
        <dt>Dados cadastrais</dt><dd>BASE QV</dd>
        <dt>Data de entrada</dt><dd>${client.entry_date ? 'BASE0' : '—'}</dd>
        <dt>Método do match</dt><dd>${escapeHtml(client.match_method_label ?? 'Sem match')}</dd>
      </dl>
    </div>`;
  el.classList.add('is-open');
  el.querySelector('#h2-drawer-close')?.addEventListener('click', closeHistorico2Drawer);
  el.querySelector('#h2-drawer-backdrop')?.addEventListener('click', closeHistorico2Drawer);
}

function bindCharts(viewModel, measurementSeries) {
  if (!window.Chart) return;
  const rows = (viewModel.cohortSummaries ?? []).sort((a, b) => cohortSort(a.entry_cohort, b.entry_cohort));
  const labels = rows.map((r) => r.entry_cohort);
  const overall = viewModel.overallNps;
  const npsPlotted = rows.map((r) => r.nps).filter((v) => v != null && !Number.isNaN(v));
  const minPlotted = npsPlotted.length ? Math.min(...npsPlotted) : 0;
  const yMin = minPlotted < 0 ? -100 : 0;

  const mk = (id, config) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    chartInstances.push(new window.Chart(canvas, config));
  };

  const npsChartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'NPS',
          data: rows.map((r) => r.nps),
          borderColor: COLORS.npsLine,
          backgroundColor: COLORS.npsFill,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const row = rows[ctx.dataIndex];
              return row?.nps != null ? `NPS: ${row.nps.toFixed(1)}` : 'NPS: —';
            },
            afterBody(items) {
              const i = items[0]?.dataIndex;
              const row = rows[i];
              if (!row) return [];
              return [
                `Respostas: ${row.nps_responses}`,
                `Promotores: ${row.promoters}`,
                `Neutros: ${row.neutrals}`,
                `Detratores: ${row.detractors}`,
              ];
            },
          },
        },
      },
      scales: {
        y: { min: yMin, max: 100 },
      },
    },
  };
  const npsPointLabels = chartPointValueLabelsPlugin((i) => rows[i]?.nps_responses ?? null);
  if (overall != null) {
    npsChartConfig.plugins = [
      npsPointLabels,
      {
        id: 'npsRefLine',
        afterDraw(chart) {
          const yScale = chart.scales.y;
          if (overall < yScale.min || overall > yScale.max) return;
          const y = yScale.getPixelForValue(overall);
          const { ctx, chartArea } = chart;
          ctx.save();
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(71, 85, 105, 0.85)';
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`NPS geral ${overall.toFixed(1)}`, chartArea.right - 4, y - 5);
          ctx.restore();
        },
      },
    ];
  } else {
    npsChartConfig.plugins = [npsPointLabels];
  }
  mk('h2-chart-nps', npsChartConfig);

  mk('h2-chart-clients', {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: rows.map((r) => r.clients), backgroundColor: COLORS.clientsBar }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              return `Clientes com data de entrada: ${ctx.raw}`;
            },
          },
        },
      },
    },
  });

  mk('h2-chart-pnd', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Promotores', data: rows.map((r) => r.promoter_pct), backgroundColor: COLORS.promoter, stack: 's' },
        { label: 'Neutros', data: rows.map((r) => r.neutral_pct), backgroundColor: COLORS.passive, stack: 's' },
        { label: 'Detratores', data: rows.map((r) => r.detractor_pct), backgroundColor: COLORS.detractor, stack: 's' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, max: 100 } },
    },
  });

  mk('h2-chart-avg', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Nota média',
        data: rows.map((r) => r.average_score),
        borderColor: COLORS.avgLine,
        tension: 0.25,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              const row = rows[ctx.dataIndex];
              return row ? `Respostas: ${row.nps_responses}` : '';
            },
          },
        },
      },
      scales: { y: { min: 0, max: 10 } },
    },
  });

  const mLabels = (measurementSeries ?? []).map((r) => r.measurement);
  const mValues = (measurementSeries ?? []).map((r) => r.responses);
  const respPointLabels = chartPointValueLabelsPlugin((i) => mValues[i] ?? null);
  mk('h2-chart-responses', {
    type: 'line',
    data: {
      labels: mLabels,
      datasets: [
        {
          label: 'Respostas',
          data: mValues,
          borderColor: COLORS.responsesLine,
          backgroundColor: COLORS.responsesFill,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
        },
      ],
    },
    plugins: [respPointLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              const i = items[0]?.dataIndex;
              const m = mLabels[i] ?? '';
              return m ? `Medição ${m}` : '';
            },
            label(ctx) {
              const row = measurementSeries[ctx.dataIndex];
              if (!row) return '';
              return [
                `Respostas válidas: ${row.responses ?? '—'}`,
                `Clientes únicos: ${row.distinct_clients ?? '—'}`,
                `Promotores: ${row.promoters ?? 0}`,
                `Neutros: ${row.neutrals ?? 0}`,
                `Detratores: ${row.detractors ?? 0}`,
                row.nps != null ? `NPS: ${formatNps(row.nps)}` : 'NPS: —',
                row.source_label ? `Fonte: ${row.source_label}` : '',
              ].filter(Boolean);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function mountStickyScroll() {
  const card = document.getElementById('historico2-filters');
  const sentinel = document.getElementById('historico2-filter-sentinel');
  if (!card || !sentinel || !historico2StickyEnabled()) return;
  const io = new IntersectionObserver(([entry]) => {
    card.classList.toggle('historico2-filters-card--shadow', !entry.isIntersecting);
  });
  io.observe(sentinel);
}

function bindPage(allClients, filtered) {
  const setFilter = (key, value) => {
    pageFilters = { ...pageFilters, [key]: value };
    tablePage = 1;
    epPage = 1;
    renderHistorico2(pageRoot);
  };

  pageRoot.querySelectorAll('[data-filter]').forEach((sel) => {
    sel.addEventListener('change', () => setFilter(sel.dataset.filter, sel.value));
  });

  let searchTimer;
  pageRoot.querySelector('#h2-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilter('search', e.target.value), 200);
  });

  pageRoot.querySelector('#h2-sticky-switch')?.addEventListener('change', (e) => {
    setHistorico2StickyEnabled(e.target.checked);
    renderHistorico2(pageRoot);
  });

  pageRoot.querySelector('#h2-clear-filters')?.addEventListener('click', () => {
    pageFilters = defaultHistorico2Filters();
    tablePage = 1;
    epPage = 1;
    renderHistorico2(pageRoot);
  });

  pageRoot.querySelectorAll('[data-chip-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-chip-key');
      const next = { ...pageFilters };
      if (key === 'search') next.search = '';
      else if (key === 'entryYear') next.entryYear = ENTRY_YEAR_ALL;
      else if (key in next) next[key] = '';
      pageFilters = next;
      tablePage = 1;
      epPage = 1;
      renderHistorico2(pageRoot);
    });
  });

  pageRoot.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sort');
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {
        sortKey = key;
        sortDir = 'asc';
      }
      renderHistorico2(pageRoot);
    });
  });

  pageRoot.querySelector('#h2-prev')?.addEventListener('click', () => {
    tablePage = Math.max(1, tablePage - 1);
    renderHistorico2(pageRoot);
  });
  pageRoot.querySelector('#h2-next')?.addEventListener('click', () => {
    tablePage += 1;
    renderHistorico2(pageRoot);
  });

  pageRoot.querySelector('#h2-ep-prev')?.addEventListener('click', () => {
    epPage = Math.max(1, epPage - 1);
    renderHistorico2(pageRoot);
  });
  pageRoot.querySelector('#h2-ep-next')?.addEventListener('click', () => {
    epPage += 1;
    renderHistorico2(pageRoot);
  });

  pageRoot.querySelectorAll('.historico2-row').forEach((row) => {
    const open = () => {
      const id = row.getAttribute('data-client-id');
      const client = allClients.find((c) => c.client_id === id);
      if (client) openDrawer(client);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function logNpsHistoricoDataset(doc) {
  const meta = doc?.meta ?? {};
  const payload = {
    dataset_version: meta.dataset_version,
    generated_at: meta.generated_at,
    build_commit: meta.build_commit,
    clients: doc?.clients?.length,
    measurement_rows: doc?.measurements?.response_index?.length,
    source: meta.responses_source,
    measurements_consolidated_version: getNpsMeasurementsConsolidatedDoc()?.meta?.dataset_version,
    measurements_consolidated_points: getNpsMeasurementsConsolidatedDoc()?.measurements?.length,
  };
  if (typeof console !== 'undefined') {
    console.info('[NPS Histórico]', payload);
  }
  return payload;
}

export function renderHistorico2(container) {
  pageRoot = container;
  destroyCharts();
  const doc = getHistorico2Doc();
  if (!doc?.clients?.length) {
    container.innerHTML = `<div class="gd-status" role="status">
      <p><strong>NPS Histórico</strong></p>
      <p class="note-muted">Dataset ainda não gerado. Execute <code>npm run generate:historico2</code> ou <code>npm run build</code>.</p>
    </div>`;
    return;
  }

  const allClients = doc.clients;
  const filtered = filterHistorico2Clients(allClients, pageFilters);
  const viewModel = buildHistorico2ViewModel(filtered);
  const enrichedDoc = getHistoricalNpsEnriched();
  const dataState = getDataState();
  const responses = dataState?.responses ?? [];
  const cycleCode = getFilters().cycleCode ?? getCycles()?.[0]?.cycle_code;
  const cycleDef = (getCycles() ?? []).find((c) => c.cycle_code === cycleCode) ?? null;
  const cycleSummaryTemplate = cycleCode ? getCycleSummary(cycleCode) : null;
  const officialState = cycleCode ? getCurrentOfficialNpsState(cycleCode) : { status: 'unavailable' };
  const liveOfficial =
    officialState.status === 'ready' ? officialState.summary : null;
  const livePrevious = cycleCode ? getExecutivePreviousOfficialSummary(cycleCode) : null;
  const consolidatedDoc = getNpsMeasurementsConsolidatedDoc();
  const baseQvDoc = getNpsMeasurementsBaseQvDoc();
  const executiveKpis = buildHistorico2ExecutiveKpis({
    filteredClients: filtered,
    clientFilters: pageFilters,
    enrichedDoc,
    responses,
    cycleDef,
    cycleSummaryTemplate,
    historicalSummaryDoc: getHistoricalNpsSummary(),
    liveOfficialSummary: liveOfficial,
    livePreviousOfficialSummary: livePrevious,
    currentCycleCode: cycleCode,
  });
  const measurementClientScope = hasExplicitHistorico2Filters(pageFilters)
    ? filtered
    : allClients;
  const measurementSeries = buildMeasurementChartSeriesForPage({
    consolidatedDoc,
    baseQvDoc,
    responses,
    cycles: getCycles(),
    historico2Doc: doc,
    filteredClients: measurementClientScope,
    clientFilters: pageFilters,
  });
  logNpsHistoricoDataset(doc);

  container.innerHTML = `
    <div class="historico2-page">
      <header class="page-header">
        <h1>NPS Histórico</h1>
        <p class="page-header__lead">Análise de NPS por safra com dados atuais da BASE QV e data de entrada histórica do BASE0.</p>
      </header>
      ${renderSourceBanner()}
      ${renderExecutiveKpis(executiveKpis, viewModel.matchQuality)}
      ${renderFilters(allClients)}
      ${renderChartsSection()}
      ${renderDimensionTable('Por programa', viewModel.programTable)}
      ${renderEpTable(viewModel.epTable)}
      ${renderExplorer(filtered)}
    </div>`;

  bindCharts(viewModel, measurementSeries);
  bindPage(allClients, filtered);
  mountStickyScroll();
}

export function closeHistorico2Drawer() {
  document.getElementById('historico2-drawer')?.classList.remove('is-open');
}
