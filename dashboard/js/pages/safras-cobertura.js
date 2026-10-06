import {
  getCustomerNpsCohorts,
  getCustomerNpsHistory,
  getSafrasCoberturaSummaries,
  getSafrasCoberturaAudit,
} from '../data/analytics-store.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatNps, formatPct, formatDate } from '../utils/format.js';
import {
  openCohortClientDrawer,
  closeCohortClientDrawer,
  isAppSourceUnavailable,
  badgeAppHtml,
} from '../ui/cohort-client-drawer.mjs';
import {
  defaultSafrasFilters,
  applySafrasFilters,
  computeSafrasKpis,
  safraOptions,
  epOptions,
  buildSafraMedicaoPivot,
  cellMetric,
} from '../data/safras-cobertura-view.mjs';

let pageFilters = defaultSafrasFilters();
let chartInstances = [];
let tablePage = 1;
let explorerSearch = '';
const PAGE_SIZE = 25;

function destroyCharts() {
  for (const c of chartInstances) c.destroy();
  chartInstances = [];
}

function sortSafraLabel(a, b) {
  if (a === 'Não informado') return 1;
  if (b === 'Não informado') return -1;
  return a.localeCompare(b);
}

function badgeAnswered(yes) {
  return yes
    ? '<span class="badge badge--success-soft">Sim</span>'
    : '<span class="badge badge--neutral-soft">Não</span>';
}

function badgeApp(v, appUnavailable) {
  return badgeAppHtml(v, appUnavailable);
}

function badgeCategory(cat, score) {
  if (score == null || score === '—') return '—';
  const c = (cat ?? '').toLowerCase();
  let cls = 'badge--neutral-soft';
  if (c.includes('promot')) cls = 'badge--promoter';
  else if (c.includes('detrat')) cls = 'badge--detractor';
  else if (c.includes('neutr')) cls = 'badge--passive';
  return `<span class="badge ${cls}">${escapeHtml(String(score))}</span>`;
}

function npsHeatClass(nps) {
  if (nps == null || Number.isNaN(nps)) return '';
  if (nps < 0) return 'safras-heat--low';
  if (nps < 30) return 'safras-heat--mid-low';
  if (nps < 50) return 'safras-heat--mid';
  return 'safras-heat--high';
}

function formatNotaMedia(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

function renderPageHeader() {
  return `<header class="page-header">
    <div>
      <p class="eyebrow">PHARUS · Cobertura</p>
      <h1 class="hero__title">Safras & Cobertura</h1>
      <p class="page-header__lead">Entrada de clientes, resposta ao NPS e adoção do App PHARUS.</p>
    </div>
    <div class="safras-page__actions">
      <button type="button" class="btn btn--secondary btn--sm" data-safras-refresh>Atualizar</button>
      <button type="button" class="btn btn--secondary btn--sm" data-safras-export-csv>Exportar CSV</button>
    </div>
  </header>`;
}

function renderFilters(customers) {
  const safras = safraOptions(customers).sort(sortSafraLabel);
  const eps = epOptions(customers);
  return `<div class="card filters-panel">
    <div class="filters-panel__grid" data-safras-filters>
      <div class="filter-field">
        <label for="sf-safra">Safra</label>
        <select id="sf-safra" class="select-input" data-f="safra">
          <option value="">Todas</option>
          ${safras
            .map(
              (s) =>
                `<option value="${escapeAttr(s)}" ${pageFilters.safra === s ? 'selected' : ''}>${escapeHtml(s)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="sf-ep">EP</label>
        <select id="sf-ep" class="select-input" data-f="ep">
          <option value="">Todos</option>
          ${eps
            .map(
              (e) =>
                `<option value="${escapeAttr(e)}" ${pageFilters.ep === e ? 'selected' : ''}>${escapeHtml(e)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="sf-app">App</label>
        <select id="sf-app" class="select-input" data-f="app">
          <option value="all">Todos</option>
          <option value="yes" ${pageFilters.app === 'yes' ? 'selected' : ''}>Com acesso</option>
          <option value="no" ${pageFilters.app === 'no' ? 'selected' : ''}>Sem acesso</option>
          <option value="unknown" ${pageFilters.app === 'unknown' ? 'selected' : ''}>Não informado</option>
        </select>
      </div>
      <div class="filter-field">
        <label for="sf-answered">Respondeu NPS</label>
        <select id="sf-answered" class="select-input" data-f="answered">
          <option value="all">Todos</option>
          <option value="yes" ${pageFilters.answered === 'yes' ? 'selected' : ''}>Já respondeu</option>
          <option value="no" ${pageFilters.answered === 'no' ? 'selected' : ''}>Nunca respondeu</option>
        </select>
      </div>
      <div class="filter-field">
        <label for="sf-cat">Categoria</label>
        <select id="sf-cat" class="select-input" data-f="categoria">
          <option value="">Todas</option>
          ${['Promotor', 'Neutro', 'Detrator']
            .map(
              (c) =>
                `<option value="${c}" ${pageFilters.categoria === c ? 'selected' : ''}>${c}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="sf-min">Mín. respostas</label>
        <input id="sf-min" type="number" min="0" class="text-input" data-f="minResponses" value="${escapeAttr(pageFilters.minResponses)}" />
      </div>
    </div>
    <div class="filters-panel__actions">
      <button type="button" class="btn btn--secondary btn--sm" data-safras-clear-filters>Limpar filtros</button>
    </div>
  </div>`;
}

function renderKpiGrid(kpis, audit) {
  const appUnavail = isAppSourceUnavailable(audit);
  const appValue = appUnavail ? '—' : String(kpis.appYes);
  const appSub = appUnavail
    ? '<span class="safras-kpi__sub safras-kpi__sub--muted">Fonte de acesso ao App ainda não disponível</span>'
    : `<span class="safras-kpi__sub">${formatPct(kpis.pctApp, 1)} da base</span>`;
  const appAnsSub = appUnavail
    ? '<span class="safras-kpi__sub safras-kpi__sub--muted">—</span>'
    : `<span class="safras-kpi__sub">${kpis.appYes ? formatPct(kpis.pctAppAnswered, 1) : 'N indisponível'} dos com App</span>`;

  const items = [
    { label: 'Clientes analisados', value: String(kpis.clients), sub: 'Universo PHARUS no recorte' },
    {
      label: 'Já responderam NPS',
      value: String(kpis.answered),
      sub: `${formatPct(kpis.pctAnswered, 1)} da base`,
    },
    {
      label: 'Nunca responderam',
      value: String(kpis.never),
      sub: `${formatPct(kpis.pctNever, 1)} da base`,
    },
    { label: 'Com App', value: appValue, sub: appSub, rawSub: true },
    { label: 'App + responderam', value: appUnavail ? '—' : String(kpis.appAndAnswered), sub: appAnsSub, rawSub: true },
    {
      label: 'NPS (última nota)',
      value: kpis.nps != null ? formatNps(kpis.nps) : '—',
      sub: 'Recorte filtrado',
    },
    {
      label: 'Mediana dias → 1º NPS',
      value: kpis.medianDays != null ? String(kpis.medianDays) : '—',
      sub: 'Entre entrada e 1ª resposta',
    },
  ];

  return `<div class="safras-kpi-grid">${items
    .map(
      (it) => `<article class="safras-kpi">
        <div class="safras-kpi__label">${escapeHtml(it.label)}</div>
        <div class="safras-kpi__value">${it.rawSub ? it.value : escapeHtml(it.value)}</div>
        <div class="safras-kpi__sub">${it.rawSub ? it.sub : escapeHtml(it.sub)}</div>
      </article>`,
    )
    .join('')}</div>`;
}

function renderCoberturaTable(summaries) {
  const rows = [...(summaries?.by_safra ?? [])]
    .filter((s) => !pageFilters.safra || s.safra_trimestre === pageFilters.safra)
    .sort((a, b) => sortSafraLabel(a.safra_trimestre, b.safra_trimestre));

  if (!rows.length) {
    return '<div class="safras-empty"><p>Nenhuma safra no recorte.</p></div>';
  }

  const body = rows
    .map((s) => {
      const pct = s.pct_que_ja_responderam ?? 0;
      const pctBar = `<div class="safras-pct-bar"><span>${formatPct(pct, 1)}</span>
        <div class="safras-pct-bar__track" aria-hidden="true"><span class="safras-pct-bar__fill" style="width:${Math.min(100, pct)}%"></span></div></div>`;
      return `<tr>
        <th scope="row">${escapeHtml(s.safra_trimestre)}</th>
        <td class="num">${s.clientes_total}</td>
        <td class="num">${s.clientes_que_responderam}</td>
        <td class="num">${pctBar}</td>
        <td class="num">${s.nps_atual != null ? formatNps(s.nps_atual) : '—'}</td>
        <td class="num">${formatNotaMedia(s.nota_media)}</td>
      </tr>`;
    })
    .join('');

  return `<div class="table-shell">
    <table class="data-table safras-data-table">
      <colgroup>
        <col style="width:20%" /><col style="width:14%" /><col style="width:16%" />
        <col style="width:18%" /><col style="width:16%" /><col style="width:16%" />
      </colgroup>
      <thead><tr>
        <th scope="col">Safra</th>
        <th scope="col" class="num">Clientes</th>
        <th scope="col" class="num">Responderam</th>
        <th scope="col" class="num">% responderam</th>
        <th scope="col" class="num">NPS</th>
        <th scope="col" class="num">Nota média</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderMatrix(history, customers) {
  const pivot = buildSafraMedicaoPivot(history, customers, 'nps');
  const { safras, ciclos, cells } = pivot;
  if (!ciclos.length) {
    return '<p class="placeholder-note">Sem histórico para matriz.</p>';
  }

  const safraList = [...safras].sort(sortSafraLabel);
  const ni = 'Não informado';
  if (!safraList.includes(ni) && ciclos.some((c) => (cells[`${ni}||${c}`] ?? []).length)) {
    safraList.push(ni);
  }

  let body = '';
  for (const s of safraList) {
    body += `<tr><th scope="row" class="safras-matrix-sticky-col">${escapeHtml(s)}</th>`;
    for (const c of ciclos) {
      const scores = cells[`${s}||${c}`] ?? [];
      const val = cellMetric(scores, 'nps');
      const heat = npsHeatClass(val);
      const display = val == null ? '—' : formatNps(val);
      body += `<td class="safras-matrix-cell ${heat}" title="NPS ${display} · n=${scores.length}">${display}</td>`;
    }
    body += '</tr>';
  }

  return `<div class="table-shell safras-matrix-shell">
    <table class="data-table safras-data-table safras-matrix-table">
      <thead><tr>
        <th class="safras-matrix-sticky-col" scope="col">Safra ↓ / Ciclo →</th>
        ${ciclos.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function filterExplorerRows(rows) {
  const q = explorerSearch.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => (r.client_name ?? '').toLowerCase().includes(q));
}

function renderExplorerSection(rows, appUnavailable) {
  const filtered = filterExplorerRows(rows);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (tablePage > pages) tablePage = pages;
  const start = (tablePage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  if (!total) {
    return `<div class="safras-section-card">
      <div class="safras-section-card__head">
        <h2 class="safras-section-card__title">Clientes</h2>
        <p class="safras-section-card__lead">Histórico de participação no NPS por cliente.</p>
      </div>
      ${renderExplorerToolbar(total)}
      <div class="safras-empty">
        <p>Nenhum cliente encontrado para os filtros selecionados.</p>
        <button type="button" class="btn btn--secondary btn--sm" data-safras-clear-filters>Limpar filtros</button>
      </div>
    </div>`;
  }

  const tbody = slice
    .map((r) => {
      const entrada = r.data_entrada ? formatDate(r.data_entrada) : '—';
      const clientLabel = r.client_name ?? 'Cliente';
      return `<tr class="safras-explorer-table__row--clickable" data-client-id="${escapeAttr(r.client_id)}" tabindex="0" role="button" aria-label="Ver detalhes de ${escapeAttr(clientLabel)}">
        <td class="col-client">${escapeHtml(r.client_name ?? '—')}</td>
        <td>${escapeHtml(r.safra_trimestre ?? '—')}</td>
        <td class="col-date">${escapeHtml(entrada)}</td>
        <td>${escapeHtml(r.ep ?? '—')}</td>
        <td>${badgeApp(r.has_app_access, appUnavailable)}</td>
        <td>${badgeAnswered(r.ever_answered_nps)}</td>
        <td class="num">${r.nps_response_count ?? 0}</td>
        <td class="num">${badgeCategory(r.last_nps_category, r.last_nps_score)}</td>
        <td class="num">${r.avg_nps_score != null ? formatNotaMedia(r.avg_nps_score) : '—'}</td>
        <td>${escapeHtml(r.last_nps_cycle ?? '—')}</td>
        <td class="num">${r.days_entry_to_first_nps_valid ?? '—'}</td>
      </tr>`;
    })
    .join('');

  return `<div class="safras-section-card">
    <div class="safras-section-card__head">
      <h2 class="safras-section-card__title">Clientes</h2>
      <p class="safras-section-card__lead">Histórico de participação no NPS por cliente.</p>
    </div>
    ${renderExplorerToolbar(total)}
    <div class="table-shell">
      <table class="data-table safras-data-table safras-explorer-table">
        <colgroup>
          <col style="width:21%" /><col style="width:8%" /><col style="width:10%" /><col style="width:13%" />
          <col style="width:8%" /><col style="width:9%" /><col style="width:5%" /><col style="width:8%" />
          <col style="width:8%" /><col style="width:16%" /><col style="width:10%" />
        </colgroup>
        <thead><tr>
          <th>Cliente</th><th>Safra</th><th>Entrada</th><th>EP</th><th>App</th><th>Respondeu?</th>
          <th class="num">Qtd</th><th class="num">Última nota</th><th class="num">Média</th>
          <th>Último ciclo</th><th class="num">Dias 1º NPS</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    ${renderTableFooter(start, total, pages)}
  </div>`;
}

function renderExplorerToolbar(total) {
  return `<div class="safras-explorer-toolbar">
    <div class="filter-field">
      <label for="sf-search">Buscar cliente</label>
      <input id="sf-search" type="search" class="text-input" placeholder="Nome…" value="${escapeAttr(explorerSearch)}" data-safras-search />
    </div>
    <p class="note-muted" style="margin:0">${total} resultado(s)</p>
  </div>`;
}

function renderTableFooter(start, total, pages) {
  const from = total ? start + 1 : 0;
  const to = Math.min(start + PAGE_SIZE, total);
  return `<div class="safras-table-footer">
    <span>${from}–${to} de ${total} clientes</span>
    <div class="safras-pager">
      <button type="button" class="btn btn--secondary btn--sm" data-page-prev ${tablePage <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span>Página ${tablePage} / ${pages}</span>
      <button type="button" class="btn btn--secondary btn--sm" data-page-next ${tablePage >= pages ? 'disabled' : ''}>Próxima →</button>
    </div>
  </div>`;
}

function renderQuality(audit) {
  if (!audit) return '';
  return `<div class="safras-section-card safras-quality-card">
    <details>
      <summary>Qualidade & cobertura</summary>
      <div class="safras-quality-grid">
        <div class="safras-quality-item"><strong>Campo safra</strong><br>${escapeHtml(audit.safra_entry_field_chosen)} (${audit.data_inicio_ciclo_coverage_pct}%)</div>
        <div class="safras-quality-item"><strong>Sem safra</strong><br>${audit.without_safra ?? 0} clientes</div>
        <div class="safras-quality-item"><strong>Histórico sem match</strong><br>${audit.historico_unmatched_to_client} respostas</div>
        <div class="safras-quality-item"><strong>Fonte App</strong><br>${escapeHtml(isAppSourceUnavailable(audit) ? 'Indisponível' : audit.app_source ?? '—')}</div>
        <div class="safras-quality-item"><strong>Mediana 1º NPS</strong><br>${audit.days_entry_to_first_nps?.median ?? '—'} dias (n=${audit.days_entry_to_first_nps?.n_valid})</div>
        <div class="safras-quality-item"><strong>Dedupe</strong><br><span class="note-muted">${escapeHtml((audit.dedupe_rule ?? '').slice(0, 120))}…</span></div>
      </div>
    </details>
  </div>`;
}

export function renderSafrasCobertura(root) {
  destroyCharts();
  const customersAll = getCustomerNpsCohorts();
  const historyAll = getCustomerNpsHistory();
  const summaries = getSafrasCoberturaSummaries();
  const audit = getSafrasCoberturaAudit();

  if (!customersAll?.length) {
    root.innerHTML = `<p class="placeholder-note">Execute <code>npm run generate:safras-cobertura</code> e recarregue os dados.</p>`;
    return;
  }

  const customers = applySafrasFilters(customersAll, pageFilters);
  const clientIds = new Set(customers.map((c) => c.client_id));
  const history = historyAll.filter((h) => clientIds.has(h.client_id));
  const kpis = computeSafrasKpis(customers);
  const appUnavailable = isAppSourceUnavailable(audit);

  root.innerHTML = `<div class="safras-page">
    ${renderPageHeader()}
    ${renderFilters(customersAll)}
    ${renderKpiGrid(kpis, audit)}

    <div class="safras-section-card">
      <div class="safras-section-card__head">
        <h2 class="safras-section-card__title">Cobertura por safra</h2>
        <p class="safras-section-card__lead">Participação no NPS e resultado por coorte de entrada.</p>
      </div>
      ${renderCoberturaTable(summaries)}
    </div>

    <div class="safras-charts-row">
      <div class="chart-card"><h3 class="safras-section-card__title">% que já respondeu por safra</h3><canvas id="chart-safra-coverage" height="220"></canvas></div>
      <div class="chart-card"><h3 class="safras-section-card__title">NPS por safra (clientes da safra)</h3><canvas id="chart-safra-nps" height="220"></canvas></div>
    </div>

    <div class="safras-section-card">
      <div class="safras-section-card__head-row">
        <div>
          <h2 class="safras-section-card__title">Matriz safra × medição</h2>
          <p class="safras-section-card__lead">NPS dos clientes de cada safra em cada ciclo.</p>
        </div>
        <p class="safras-help-tip" title="O valor representa o NPS dos clientes pertencentes à safra da linha, medido no ciclo da coluna.">ⓘ NPS da safra na medição da coluna</p>
      </div>
      ${renderMatrix(history, customers)}
    </div>

    ${renderExplorerSection(customers, appUnavailable)}
    ${renderQuality(audit)}
  </div>`;

  bindSafrasCobertura(root, customersAll, historyAll, customers);
  bindCharts(summaries, pageFilters.safra);
}

function bindCharts(summaries, safraFilter) {
  const rows = (summaries?.by_safra ?? [])
    .filter((s) => s.safra_trimestre !== 'Não informado' && (!safraFilter || s.safra_trimestre === safraFilter))
    .sort((a, b) => sortSafraLabel(a.safra_trimestre, b.safra_trimestre));
  const labels = rows.map((r) => r.safra_trimestre);
  const cov = document.getElementById('chart-safra-coverage');
  const nps = document.getElementById('chart-safra-nps');
  if (cov && typeof Chart !== 'undefined') {
    chartInstances.push(
      new Chart(cov, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '% responderam',
              data: rows.map((r) => r.pct_que_ja_responderam),
              backgroundColor: '#e85d3a',
              borderRadius: 4,
            },
          ],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { max: 100, ticks: { callback: (v) => `${v}%` } } },
        },
      }),
    );
  }
  if (nps && typeof Chart !== 'undefined') {
    chartInstances.push(
      new Chart(nps, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'NPS',
              data: rows.map((r) => r.nps_atual),
              borderColor: '#c44a2a',
              backgroundColor: 'rgba(232, 93, 58, 0.08)',
              fill: true,
              tension: 0.25,
            },
          ],
        },
        options: { plugins: { legend: { display: false } } },
      }),
    );
  }
}

function exportExplorerCsv(customers) {
  const rows = filterExplorerRows(customers);
  const headers = [
    'cliente',
    'safra',
    'entrada',
    'ep',
    'app',
    'respondeu',
    'qtd',
    'ultima_nota',
    'media',
    'ultimo_ciclo',
    'dias_primeiro_nps',
  ];
  const lines = [headers.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.client_name,
        r.safra_trimestre,
        r.data_entrada,
        r.ep,
        r.has_app_access,
        r.ever_answered_nps,
        r.nps_response_count,
        r.last_nps_score,
        r.avg_nps_score,
        r.last_nps_cycle,
        r.days_entry_to_first_nps_valid,
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(';'),
    );
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'safras-cobertura-clientes.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function closeSafrasDrawer() {
  closeCohortClientDrawer();
}

function bindSafrasCobertura(root, customersAll, historyAll, customersFiltered) {
  const appUnavailable = isAppSourceUnavailable(getSafrasCoberturaAudit());

  root.querySelector('[data-safras-filters]')?.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.dataset.f) return;
    pageFilters = { ...pageFilters, [t.dataset.f]: t.value };
    tablePage = 1;
    renderSafrasCobertura(root);
  });

  const minInput = root.querySelector('[data-f="minResponses"]');
  minInput?.addEventListener('blur', (ev) => {
    pageFilters = { ...pageFilters, minResponses: ev.target.value };
    tablePage = 1;
    renderSafrasCobertura(root);
  });
  minInput?.addEventListener('change', (ev) => {
    pageFilters = { ...pageFilters, minResponses: ev.target.value };
    tablePage = 1;
    renderSafrasCobertura(root);
  });

  root.querySelectorAll('[data-safras-clear-filters]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pageFilters = defaultSafrasFilters();
      explorerSearch = '';
      tablePage = 1;
      renderSafrasCobertura(root);
    });
  });

  root.querySelector('[data-safras-search]')?.addEventListener('input', (ev) => {
    explorerSearch = ev.target.value;
    tablePage = 1;
    renderSafrasCobertura(root);
  });

  root.querySelector('[data-safras-refresh]')?.addEventListener('click', () => {
    window.location.reload();
  });

  root.querySelector('[data-safras-export-csv]')?.addEventListener('click', () => {
    exportExplorerCsv(customersFiltered);
  });

  root.querySelector('[data-page-prev]')?.addEventListener('click', () => {
    if (tablePage > 1) {
      tablePage -= 1;
      renderSafrasCobertura(root);
    }
  });

  root.querySelector('[data-page-next]')?.addEventListener('click', () => {
    tablePage += 1;
    renderSafrasCobertura(root);
  });

  const openRow = (clientId) =>
    openCohortClientDrawer(clientId, customersAll, historyAll, { appUnavailable });

  root.querySelectorAll('.safras-explorer-table tbody tr[data-client-id]').forEach((row) => {
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a, input, label')) return;
      openRow(row.dataset.clientId);
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openRow(row.dataset.clientId);
      }
    });
  });
}
