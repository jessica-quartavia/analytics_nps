import {
  getResponses,
  getMigrationMatrix,
  getActionQueue,
  getPairedCycles,
  getClientSatisfaction,
  getClientSatMap,
} from '../data/analytics-store.js';
import { getFilters, setFilter } from '../filters/global-filters.js';
import {
  filterResponses,
  movementKpis,
  evolutionDistribution,
  topScoreChanges,
  countActionPriorities,
  migrationCellKey,
} from '../data/store-core.mjs';
import { formatNps, formatPct, formatCsatAverage, formatDate } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { sectionHead, sectionLead } from '../ui/help.js';

const CATEGORIES = ['Detrator', 'Neutro', 'Promotor'];
const POSITIVE_CELLS = new Set([
  migrationCellKey('Detrator', 'Promotor'),
  migrationCellKey('Detrator', 'Neutro'),
  migrationCellKey('Neutro', 'Promotor'),
]);
const NEGATIVE_CELLS = new Set([
  migrationCellKey('Promotor', 'Neutro'),
  migrationCellKey('Promotor', 'Detrator'),
  migrationCellKey('Neutro', 'Detrator'),
]);

let tableState = { page: 1, pageSize: 25, sortKey: 'score_delta', sortDir: 'asc' };
let tableController = null;

function beginTableBindings() {
  tableController?.abort();
  tableController = new AbortController();
  return tableController.signal;
}

function priorityForClient(actionQueue, clientId) {
  const item = actionQueue.find((a) => a.client_id === clientId);
  return item?.priority ?? '—';
}

function reasonForClient(actionQueue, clientId) {
  return actionQueue.find((a) => a.client_id === clientId)?.reason ?? null;
}

function epBadgeHtml(r) {
  if (r.ep_resolution_confidence !== 'low') return '';
  return '<span class="ep-badge" title="EP reconstruído a partir do estado atual por ausência de histórico suficiente.">EP aproximado</span>';
}

function buildFilterContext(cycleCode, filters) {
  const all = getResponses(cycleCode);
  const paired = getPairedCycles(cycleCode);
  const pairedSet = new Set(paired?.paired_client_ids ?? []);
  const actionQueue = getActionQueue(cycleCode);
  let priorityClientIds = null;
  if (filters.priority) {
    priorityClientIds = new Set(
      actionQueue.filter((a) => a.priority === filters.priority).map((a) => a.client_id),
    );
  }
  const rows = filterResponses(all, { ...filters, withPreviousOnly: true }, {
    pairedClientIds: filters.base === 'paired' ? pairedSet : null,
    priorityClientIds,
    clientSatById: getClientSatMap(),
  });
  return { rows, actionQueue, pairedSet };
}

function renderMatrix(matrix, filters) {
  if (!matrix) {
    return '<p class="placeholder-note" role="status">Matriz indisponível para este ciclo.</p>';
  }
  const maxCount = Math.max(...matrix.cells.map((c) => c.count), 1);
  let html = `<div class="matrix-wrap"><table class="migration-matrix" role="grid" aria-label="Matriz de migração NPS">
    <thead><tr><th>Anterior ↓ / Atual →</th>${CATEGORIES.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>`;
  for (const from of CATEGORIES) {
    html += `<tr><th scope="row">${escapeHtml(from)}</th>`;
    for (const to of CATEGORIES) {
      const key = migrationCellKey(from, to);
      const cell = matrix.cells.find((c) => c.key === key) ?? { count: 0, pct_of_origin: 0 };
      const intensity = cell.count / maxCount;
      const classes = [
        'migration-matrix__cell',
        POSITIVE_CELLS.has(key) ? 'cell--positive' : '',
        NEGATIVE_CELLS.has(key) ? 'cell--negative' : '',
        filters.migrationCell === key ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const tip = `${from} → ${to}: ${cell.count} (${formatPct(cell.pct_of_origin, 1)} da origem)`;
      html += `<td class="${classes}" data-migration="${escapeAttr(key)}" style="--cell-intensity:${intensity}" tabindex="0" role="gridcell" title="${escapeAttr(tip)}">
        <div><strong>${cell.count}</strong></div>
        <div class="matrix-cell-meta">${formatPct(cell.pct_of_origin, 1)}</div>
      </td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function renderFlow(matrix) {
  if (!matrix) return '<p class="placeholder-note">Sem fluxo para exibir.</p>';
  const flows = matrix.cells.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  if (!flows.length) return '<p class="placeholder-note">Nenhuma migração registrada.</p>';
  const max = flows[0]?.count ?? 1;
  return `<div class="flow-bars">${flows
    .map((f) => {
      const w = (f.count / max) * 100;
      const [from, to] = f.key.split(' -> ');
      return `<div class="flow-row"><span>${escapeHtml(from)}</span><div class="flow-bar"><span style="width:${w}%"></span></div><span>${escapeHtml(to)}</span></div>`;
    })
    .join('')}</div>`;
}

const DELTA_BAND_HINTS = {
  'Grande melhora': 'Clientes que aumentaram bastante a nota entre os ciclos.',
  Melhora: 'Clientes que subiram a nota, sem ser uma mudança extrema.',
  Estável: 'Clientes cuja nota ficou praticamente igual.',
  Queda: 'Clientes que reduziram a nota.',
  'Queda severa': 'Clientes com queda forte de nota entre os ciclos.',
};

const DELTA_BAND_CLASS = {
  'Grande melhora': 'delta-band--up',
  Melhora: 'delta-band--up',
  Estável: 'delta-band--stable',
  Queda: 'delta-band--down',
  'Queda severa': 'delta-band--down',
};

function renderDeltaDist(rows) {
  const { dist, total } = evolutionDistribution(rows);
  if (!total) return '<p class="placeholder-note" role="status">Sem dados de evolução para os filtros atuais.</p>';
  return `<div class="delta-band-grid" role="list">${Object.entries(dist)
    .map(([label, n]) => {
      const pct = total ? (n / total) * 100 : 0;
      const tone = DELTA_BAND_CLASS[label] ?? '';
      return `<article class="delta-band ${tone}" role="listitem">
        <div class="delta-band__title">${escapeHtml(label)}</div>
        <div class="delta-band__value">${escapeHtml(String(n))}</div>
        <div class="delta-band__pct">${escapeHtml(formatPct(pct, 1))}</div>
        <div class="delta-band__bar" aria-hidden="true"><div class="delta-band__fill" style="width:${Math.max(pct, n ? 4 : 0)}%"></div></div>
        <div class="delta-band__hint">${escapeHtml(DELTA_BAND_HINTS[label] ?? '')}</div>
      </article>`;
    })
    .join('')}</div>`;
}

function renderTopLists(rows) {
  const up = topScoreChanges(rows, 'up', 10);
  const down = topScoreChanges(rows, 'down', 10);
  const rowHtml = (r) =>
    `<tr><td>${escapeHtml(r.client_name ?? '—')}</td><td>${escapeHtml(r.ep_name ?? '—')}${epBadgeHtml(r)}</td><td>${escapeHtml(r.previous_score)}</td><td>${escapeHtml(r.score)}</td><td>${escapeHtml(r.score_delta)}</td><td>${escapeHtml(r.nps_migration ?? '—')}</td></tr>`;
  const emptyRow = '<tr><td colspan="6" class="placeholder-note">Nenhum cliente neste recorte.</td></tr>';
  return `<div class="grid grid--2">
    <div class="card"><h3>Maiores recuperações</h3><div class="table-scroll"><table class="gd-table"><thead><tr><th>Cliente</th><th>EP</th><th>Ant.</th><th>Atual</th><th>Δ</th><th>Migração</th></tr></thead><tbody>${up.length ? up.map(rowHtml).join('') : emptyRow}</tbody></table></div></div>
    <div class="card"><h3>Maiores quedas</h3><div class="table-scroll"><table class="gd-table"><thead><tr><th>Cliente</th><th>EP</th><th>Ant.</th><th>Atual</th><th>Δ</th><th>Migração</th></tr></thead><tbody>${down.length ? down.map(rowHtml).join('') : emptyRow}</tbody></table></div></div>
  </div>`;
}

function sortRows(rows, key, dir) {
  const mul = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv, 'pt-BR') * mul;
    return (av - bv) * mul;
  });
}

function renderTable(rows, actionQueue) {
  const sorted = sortRows(rows, tableState.sortKey, tableState.sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / tableState.pageSize));
  if (tableState.page > totalPages) tableState.page = totalPages;
  const start = (tableState.page - 1) * tableState.pageSize;
  const pageRows = sorted.slice(start, start + tableState.pageSize);
  const searchVal = escapeAttr(getFilters().search);

  const body = pageRows
    .map((r) => {
      const pr = priorityForClient(actionQueue, r.client_id);
      return `<tr data-client-id="${escapeAttr(r.client_id)}" tabindex="0">
        <td>${escapeHtml(r.client_name ?? '—')}</td>
        <td>${escapeHtml(r.ep_name ?? '—')}${epBadgeHtml(r)}</td>
        <td>${escapeHtml(r.previous_score ?? '—')}</td>
        <td>${escapeHtml(r.score)}</td>
        <td>${escapeHtml(r.score_delta ?? '—')}</td>
        <td>${escapeHtml(r.previous_category ?? '—')}</td>
        <td>${escapeHtml(r.nps_category)}</td>
        <td>${escapeHtml(r.nps_migration ?? '—')}</td>
        <td>${escapeHtml(r.evolution_status ?? '—')}</td>
        <td>${escapeHtml(pr)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="table-toolbar">
      <label class="sr-only" for="search-clients">Buscar</label>
      <input class="text-input" id="search-clients" type="search" placeholder="Nome, código ou ID" value="${searchVal}" aria-label="Buscar cliente por nome, código ou ID" />
      <label>Por página
        <select class="select-input" id="page-size" aria-label="Itens por página">
          ${[25, 50, 100].map((n) => `<option value="${n}" ${tableState.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="table-scroll">
      <table class="gd-table" id="clients-table">
        <thead><tr>
          <th data-sort="client_name" scope="col">Cliente</th>
          <th data-sort="ep_name" scope="col">EP</th>
          <th data-sort="previous_score" scope="col">Nota ant.</th>
          <th data-sort="score" scope="col">Nota atual</th>
          <th data-sort="score_delta" scope="col">Delta</th>
          <th scope="col">Anterior</th>
          <th scope="col">Atual</th>
          <th scope="col">Migração</th>
          <th data-sort="evolution_status" scope="col">Evolução</th>
          <th scope="col">Prioridade</th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="10"><span class="placeholder-note">Nenhum cliente com ciclo anterior neste filtro.</span></td></tr>'}</tbody>
      </table>
    </div>
    <div class="pagination">
      <span>${sorted.length} clientes · página ${tableState.page}/${totalPages}</span>
      <span>
        <button type="button" class="chip" id="page-prev" ${tableState.page <= 1 ? 'disabled' : ''}>Anterior</button>
        <button type="button" class="chip" id="page-next" ${tableState.page >= totalPages ? 'disabled' : ''}>Próxima</button>
      </span>
    </div>`;
}

export function closeDrawer() {
  const backdrop = document.getElementById('drawer-backdrop');
  const drawer = document.getElementById('client-drawer');
  backdrop?.classList.remove('is-open');
  drawer?.classList.remove('is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
  backdrop?.setAttribute('aria-expanded', 'false');
  drawer?.setAttribute('aria-hidden', 'true');
}

function renderDrawerSatisfaction(clientId, cycleRow) {
  const sat = getClientSatisfaction(clientId);

  if (!sat?.has_csat) {
    return `<h3>Satisfação</h3><p class="note-muted">Sem respostas CSAT.</p>
      <p>NPS do ciclo: ${escapeHtml(String(cycleRow?.score ?? '—'))} · ${escapeHtml(formatDate(cycleRow?.submitted_at))}</p>
      <p>Histórico NPS: ${escapeHtml(String(sat?.nps_responses_count ?? '—'))} resposta(s)</p>`;
  }

  return `<h3>Satisfação</h3>
    <p><strong>NPS do ciclo:</strong> ${escapeHtml(String(cycleRow?.score ?? '—'))} · ${escapeHtml(formatDate(cycleRow?.submitted_at))}</p>
    <p>Histórico NPS: ${escapeHtml(String(sat.nps_responses_count ?? '—'))} resposta(s)</p>
    <p><strong>CSAT:</strong> média ${escapeHtml(formatCsatAverage(sat.csat_average))} · última ${escapeHtml(String(sat.latest_csat_score ?? '—'))} · ${escapeHtml(formatDate(sat.latest_csat_date))}</p>
    <p>Respostas CSAT: ${escapeHtml(String(sat.csat_responses_count ?? 0))}</p>`;
}

export function openClientDrawer(clientId, rows, actionQueue) {
  const r = rows.find((x) => x.client_id === clientId);
  if (!r) return;
  const backdrop = document.getElementById('drawer-backdrop');
  const drawer = document.getElementById('client-drawer');
  const reason = reasonForClient(actionQueue, r.client_id);
  drawer.innerHTML = `
    <button type="button" class="drawer__close" id="drawer-close" aria-label="Fechar painel">×</button>
    <h2>${escapeHtml(r.client_name ?? 'Cliente')}</h2>
    <p>${escapeHtml(r.ep_name ?? '—')}${r.ep_resolution_confidence === 'low' ? ' <span class="ep-badge">EP aproximado</span>' : ''}</p>
    <h3>Ciclo anterior</h3>
    <p>Nota: ${escapeHtml(r.previous_score ?? '—')} · ${escapeHtml(r.previous_category ?? '—')}</p>
    <h3>Ciclo atual</h3>
    <p>Nota: ${escapeHtml(r.score)} · ${escapeHtml(r.nps_category)}</p>
    <p>Delta: ${escapeHtml(r.score_delta ?? '—')} · Migração: ${escapeHtml(r.nps_migration ?? '—')}</p>
    <p>Evolução: ${escapeHtml(r.evolution_status ?? '—')} · Prioridade: ${escapeHtml(priorityForClient(actionQueue, r.client_id))}</p>
    ${reason ? `<p><strong>Fila de ação:</strong> ${escapeHtml(reason)}</p>` : ''}
    <h3>Comentário atual</h3>
    <p class="drawer-comment">${escapeHtml(r.comment || 'Sem comentário.')}</p>
    ${renderDrawerSatisfaction(clientId, r)}
  `;
  backdrop.classList.add('is-open');
  drawer.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  backdrop.setAttribute('aria-expanded', 'true');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.focus();
}

function bindDrawerEvents(rows, actionQueue, signal) {
  const opts = { signal };
  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer, opts);
  document.getElementById('drawer-backdrop')?.addEventListener('click', closeDrawer, opts);
  document.querySelectorAll('#clients-table tbody tr[data-client-id]').forEach((tr) => {
    tr.addEventListener('click', () => openClientDrawer(tr.dataset.clientId, rows, actionQueue), opts);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openClientDrawer(tr.dataset.clientId, rows, actionQueue);
      }
    }, opts);
  });
}

function bindTableControls(onRefresh, signal) {
  const opts = { signal };
  document.getElementById('search-clients')?.addEventListener('input', (e) => {
    setFilter('search', e.target.value);
    tableState.page = 1;
    onRefresh();
  }, opts);
  document.getElementById('page-size')?.addEventListener('change', (e) => {
    tableState.pageSize = Number(e.target.value);
    tableState.page = 1;
    onRefresh();
  }, opts);
  document.getElementById('page-prev')?.addEventListener('click', () => {
    tableState.page -= 1;
    onRefresh();
  }, opts);
  document.getElementById('page-next')?.addEventListener('click', () => {
    tableState.page += 1;
    onRefresh();
  }, opts);
  document.querySelectorAll('#clients-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (tableState.sortKey === key) tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        tableState.sortKey = key;
        tableState.sortDir = 'asc';
      }
      onRefresh();
    }, opts);
  });
}

export function renderMovimento(root, ctx = {}) {
  const signal = ctx.signal;
  const filters = getFilters();
  const matrix = getMigrationMatrix(filters.cycleCode);
  const { rows, actionQueue } = buildFilterContext(filters.cycleCode, filters);
  const kpis = movementKpis(rows);
  const priorities = countActionPriorities(getActionQueue(filters.cycleCode));

  const rerenderTable = () => {
    const tableSignal = beginTableBindings();
    const f = getFilters();
    const tableCtx = buildFilterContext(f.cycleCode, f);
    const tableHost = document.getElementById('movimento-table-host');
    if (tableHost) {
      tableHost.innerHTML = renderTable(tableCtx.rows, tableCtx.actionQueue);
      bindTableControls(rerenderTable, tableSignal);
      bindDrawerEvents(tableCtx.rows, tableCtx.actionQueue, tableSignal);
    }
  };

  root.innerHTML = `
    <header class="page-header">
      <div>
        <p class="eyebrow">Movimento</p>
        <h1 class="hero__title">Quem mudou e em qual direção?</h1>
        <p class="page-header__lead">Mostra como os clientes mudaram de nota ou de categoria entre um ciclo e outro.</p>
      </div>
    </header>
    <div class="metric-compact-grid">
      <article class="metric-compact"><div class="metric-compact__label">Clientes pareados</div><div class="metric-compact__value">${escapeHtml(String(kpis.paired))}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Melhoraram</div><div class="metric-compact__value">${escapeHtml(String(kpis.improved))}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Estáveis</div><div class="metric-compact__value">${escapeHtml(String(kpis.stable))}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Pioraram</div><div class="metric-compact__value">${escapeHtml(String(kpis.declined + kpis.severe))}</div><div class="metric-compact__note">Queda severa: ${kpis.severe}</div></article>
    </div>
    ${sectionHead('Matriz 3×3', 'Promotor · Neutro · Detrator entre ciclos', 'Cada célula mostra quantos clientes foram de uma categoria para outra.')}
    ${renderMatrix(matrix, filters)}
    ${sectionHead('Fluxo de categorias', null, 'Visão simplificada do fluxo entre grupos de clientes.')}
    <div class="card">${renderFlow(matrix)}</div>
    ${sectionHead('Distribuição do delta de nota', 'Faixas de evolução da nota', 'Resumo de quantos clientes melhoraram, ficaram estáveis ou pioraram.')}
    ${renderDeltaDist(rows)}
    <h2 class="section-title">Maiores alterações</h2>
    ${renderTopLists(rows)}
    <h2 class="section-title">Ações geradas por movimento</h2>
    <div class="action-chips" id="priority-chips" role="group" aria-label="Filtrar por prioridade da fila de ação">
      ${['Alta', 'Média', 'Aprendizado', 'Investigar']
        .map(
          (p) =>
            `<button type="button" class="chip ${filters.priority === p ? 'is-active' : ''}" data-priority="${escapeAttr(p)}" aria-pressed="${filters.priority === p}">${escapeHtml(p)} (${priorities[p] ?? 0})</button>`,
        )
        .join('')}
      <button type="button" class="chip ${!filters.priority ? 'is-active' : ''}" data-priority="" aria-pressed="${!filters.priority}">Todas</button>
    </div>
    <h2 class="section-title">Clientes</h2>
    <div id="movimento-table-host"></div>
  `;

  const opts = signal ? { signal } : undefined;
  document.querySelectorAll('[data-migration]').forEach((td) => {
    td.addEventListener('click', () => {
      const key = td.dataset.migration;
      setFilter('migrationCell', getFilters().migrationCell === key ? '' : key);
      tableState.page = 1;
      renderMovimento(root, ctx);
    }, opts);
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        td.click();
      }
    }, opts);
  });

  document.querySelectorAll('#priority-chips [data-priority]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setFilter('priority', btn.dataset.priority);
      tableState.page = 1;
      renderMovimento(root, ctx);
    }, opts);
  });

  if (signal) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    }, { signal });
  }

  rerenderTable();
}
