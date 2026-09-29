import {
  getActionPlanRows,
  getActionPlanMeta,
  hasActionPlanArtifacts,
  getCycleSummary,
  getDataState,
  getTopicFilterOptions,
  patchLocalActionTracking,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import {
  filterActionPlanRows,
  computeActionPlanKpis,
  sortActionPlanRows,
  buildActionPlanCsv,
} from '../data/store-core.mjs';
import { formatCsatAverage, formatDate } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { sectionHead, TIPS, helpTip } from '../ui/help.js';
const PRIORITIES = ['Alta', 'Média', 'Investigar', 'Aprendizado'];
const STATUS_OPTIONS = [
  'Novo',
  'Em análise',
  'Contatado',
  'Em acompanhamento',
  'Resolvido',
  'Sem ação imediata',
];

let tableState = {
  page: 1,
  pageSize: 25,
  sortKey: 'priority',
  sortDir: 'desc',
  actionStatus: '',
  search: '',
  priorityFilter: '',
};
let tableController = null;
let selectedRow = null;

function beginTableBindings() {
  tableController?.abort();
  tableController = new AbortController();
  return tableController.signal;
}

function priorityPill(p) {
  return `<span class="priority-pill priority-pill--${escapeAttr(p)}">${escapeHtml(p)}</span>`;
}

function qualitativeBadge(row) {
  if (!row.qualitative_signal) return '';
  return `<span class="qualitative-badge">${helpTip('Sinal qualitativo', TIPS.sinalQualitativo)}</span>`;
}

function epBadge(confidence) {
  if (confidence !== 'low') return '';
  return '<span class="ep-badge" title="EP reconstruído (proxy).">EP aproximado</span>';
}

function buildFilteredRows(cycleCode, filters, { includePriority = true } = {}) {
  const all = getActionPlanRows(cycleCode);
  const planFilters = { ...filters, priority: '' };
  return filterActionPlanRows(all, planFilters, {
    actionStatus: tableState.actionStatus,
    search: tableState.search,
    priority: includePriority && tableState.priorityFilter ? tableState.priorityFilter : '',
  });
}

function renderFunnel(kpis, total) {
  const segs = PRIORITIES.map((p) => {
    const n = kpis[p] ?? 0;
    const pct = total ? (n / total) * 100 : 0;
    return { p, n, pct };
  });
  return `
    <div class="action-funnel" role="group" aria-label="Composição da fila por prioridade">
      ${segs
        .map(
          ({ p, n }) => `
        <article class="action-funnel__card ${p === 'Aprendizado' ? 'action-funnel__card--learning' : ''}">
          <div class="action-funnel__label">${p === 'Aprendizado' ? 'Casos para aprender' : escapeHtml(p)}</div>
          <div class="action-funnel__value">${n}</div>
        </article>`,
        )
        .join('')}
    </div>
    <div class="action-funnel-bar" aria-hidden="true">
      ${segs
        .map(
          ({ p, pct }) =>
            `<span class="action-funnel-bar__seg action-funnel-bar__seg--${p.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')}" style="flex-grow:${pct || 0.001}"></span>`,
        )
        .join('')}
    </div>`;
}

function renderPrioritySegments(allRows) {
  const kpis = computeActionPlanKpis(allRows);
  const total = allRows.length;
  const items = [
    ...PRIORITIES.map((p) => ({ key: p, label: p, count: kpis[p] ?? 0 })),
    { key: '', label: 'Todas', count: total },
  ];
  const active = tableState.priorityFilter || '';
  return `<div class="action-priority-segment" id="action-priority-chips" role="group" aria-label="Filtrar prioridade na fila nominal">
    ${items
      .map(
        ({ key, label, count }) =>
          `<button type="button" class="action-priority-segment__btn ${active === key ? 'is-active' : ''}" data-priority="${escapeAttr(key)}">${escapeHtml(label)} <span class="action-priority-segment__count">${count}</span></button>`,
      )
      .join('')}
  </div>`;
}

function renderTable(rows) {
  const sorted = sortActionPlanRows(rows, tableState.sortKey, tableState.sortDir);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / tableState.pageSize));
  if (tableState.page > pages) tableState.page = pages;
  const start = (tableState.page - 1) * tableState.pageSize;
  const pageRows = sorted.slice(start, start + tableState.pageSize);

  const body = pageRows.length
    ? pageRows
        .map(
          (r) => `
      <tr class="action-row" data-client-id="${escapeAttr(r.client_id)}" data-cycle="${escapeAttr(r.cycle_code)}" tabindex="0">
        <td class="col-priority">${priorityPill(r.priority)}${qualitativeBadge(r)}</td>
        <td class="col-client">${escapeHtml(r.client_name ?? '—')}</td>
        <td class="col-ep">${escapeHtml(r.ep_name ?? '—')}${epBadge(r.ep_resolution_confidence)}</td>
        <td class="num">${r.previous_score ?? '—'}</td>
        <td class="num">${r.current_score ?? '—'}</td>
        <td class="num">${r.score_delta ?? '—'}</td>
        <td>${escapeHtml(r.nps_migration ?? '—')}</td>
        <td class="col-hide-md">${escapeHtml(r.primary_topic ?? '—')}</td>
        <td class="num col-hide-md">${r.has_csat ? formatCsatAverage(r.csat_average) : '—'}</td>
        <td class="reason-cell col-reason" title="${escapeAttr(r.reason ?? '')}">${escapeHtml(r.reason ?? '—')}</td>
        <td>${escapeHtml(r.status ?? 'Novo')}</td>
        <td class="col-hide-md">${escapeHtml(r.owner || '—')}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="12" class="placeholder-note">${escapeHtml(
        tableState.priorityFilter
          ? `Nenhum cliente classificado como ${tableState.priorityFilter} neste ciclo.`
          : 'Nenhum cliente neste recorte.',
      )}</td></tr>`;

  return `
    <div class="table-toolbar">
      <label class="filter-field">Busca
        <input class="text-input" id="action-search" type="search" placeholder="Cliente, EP ou motivo" value="${escapeAttr(tableState.search)}" />
      </label>
      <label class="filter-field">Status
        <select class="select-input" id="action-status-filter">
          <option value="">Todos</option>
          ${STATUS_OPTIONS.map((s) => `<option value="${escapeAttr(s)}" ${tableState.actionStatus === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </label>
      <label class="filter-field">Por página
        <select class="select-input" id="action-page-size">
          ${[25, 50, 100].map((n) => `<option value="${n}" ${tableState.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="btn btn--secondary" id="action-export-csv">Exportar CSV</button>
    </div>
    <div class="table-scroll">
      <table class="data-table data-table--action" id="action-plan-table">
        <thead><tr>
          <th data-sort="priority">${helpTip('Prioridade', TIPS.prioridadeAlta)}</th>
          <th class="col-client" data-sort="client_name">Cliente</th>
          <th class="col-ep" data-sort="ep_name">EP</th>
          <th class="num" data-sort="previous_score">Nota ant.</th>
          <th class="num" data-sort="current_score">Nota atual</th>
          <th class="num" data-sort="score_delta">Δ</th>
          <th data-sort="nps_migration">Migração</th>
          <th class="col-hide-md">Tema principal</th>
          <th class="num col-hide-md">CSAT</th>
          <th class="col-reason" data-sort="reason">Motivo</th>
          <th data-sort="status">Status</th>
          <th class="col-hide-md" data-sort="owner">Responsável</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="table-pagination">
      <button type="button" class="btn btn--ghost" id="action-page-prev" ${tableState.page <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${tableState.page} / ${pages} (${total} clientes)</span>
      <button type="button" class="btn btn--ghost" id="action-page-next" ${tableState.page >= pages ? 'disabled' : ''}>Próxima</button>
    </div>`;
}

function renderInvestigateSection(kpis) {
  if ((kpis.Investigar ?? 0) > 0) return '';
  return `<p class="placeholder-note" role="status">Nenhum caso classificado para investigação neste ciclo.</p>`;
}

function openActionDrawer(row) {
  selectedRow = row;
  const drawer = document.getElementById('action-drawer');
  const backdrop = document.getElementById('action-drawer-backdrop');
  if (!drawer) return;

  const priorityWhy = (row.priority_rules ?? []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
  const otherSignals = (row.other_signals ?? []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
  const topics = (row.topics ?? [])
    .map((t) => `<li>${escapeHtml(t.topic)} · ${escapeHtml(t.valence)}</li>`)
    .join('');
  const quality = (row.quality_notes ?? []).map((n) => `<li>${escapeHtml(n)}</li>`).join('');

  drawer.innerHTML = `
    <header class="drawer__header">
      <h2>${escapeHtml(row.client_name ?? 'Cliente')}</h2>
      <button type="button" class="drawer__close" id="action-drawer-close" aria-label="Fechar">×</button>
    </header>
    <div class="drawer__body">
      <p><strong>EP:</strong> ${escapeHtml(row.ep_name ?? '—')} ${epBadge(row.ep_resolution_confidence)}</p>
      <h3>Histórico NPS</h3>
      <ul class="drawer-list">
        <li>Nota anterior: ${row.previous_score ?? '—'}</li>
        <li>Nota atual: ${row.current_score ?? '—'}</li>
        <li>Delta: ${row.score_delta ?? '—'}</li>
        <li>Migração: ${escapeHtml(row.nps_migration ?? '—')}</li>
        <li>Evolução: ${escapeHtml(row.evolution_status ?? '—')}</li>
      </ul>
      <h3>Por que está nesta prioridade</h3>
      <ul class="drawer-list">${priorityWhy || `<li>${escapeHtml(row.reason ?? '—')}</li>`}</ul>
      <p><strong>Prioridade resultante:</strong> ${priorityPill(row.priority)}${qualitativeBadge(row)}</p>
      ${
        otherSignals
          ? `<h3>Outros sinais observados</h3><ul class="drawer-list">${otherSignals}</ul>`
          : ''
      }
      <h3>Comentário</h3>
      <p class="drawer-comment">${escapeHtml(row.comment ?? 'Sem comentário.')}</p>
      <h3>Temas</h3>
      <ul class="drawer-list">${topics || '<li>Sem temas classificados.</li>'}</ul>
      <h3>CSAT</h3>
      <ul class="drawer-list">
        <li>Média: ${row.has_csat ? formatCsatAverage(row.csat_average) : '—'}</li>
        <li>Última nota: ${row.latest_csat_score ?? '—'}</li>
        <li>Respostas CSAT: ${row.csat_responses_count ?? 0}</li>
      </ul>
      <p><strong>Tipo de ação sugerida:</strong> ${escapeHtml(row.recommended_action_type ?? '—')}</p>
      ${
        row.population_context
          ? `<p class="note-muted">${escapeHtml(row.population_context)}</p>`
          : ''
      }
      ${quality ? `<h3>Qualidade</h3><ul class="drawer-list">${quality}</ul>` : ''}
      <h3>Acompanhamento operacional</h3>
      <div class="action-tracking action-tracking--disabled" aria-disabled="true">
        <p class="note-muted">Funcionalidade operacional em implementação.</p>
        <form id="action-tracking-form">
          <label>Status
            <select class="select-input" name="status" id="track-status" disabled>
              ${STATUS_OPTIONS.map((s) => `<option value="${escapeAttr(s)}" ${row.status === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
          </label>
          <label>Responsável
            <input class="text-input" name="owner" id="track-owner" value="${escapeAttr(row.owner ?? '')}" disabled />
          </label>
          <label>Notas
            <textarea class="text-input" name="action_notes" id="track-notes" rows="4" disabled>${escapeHtml(row.action_notes ?? '')}</textarea>
          </label>
          <button type="button" class="btn btn--primary" disabled tabindex="-1">Salvar acompanhamento</button>
        </form>
      </div>
    </div>`;

  drawer.classList.add('is-open');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-expanded', 'true');
  drawer.focus();
}

export function closeActionDrawer() {
  document.getElementById('action-drawer')?.classList.remove('is-open');
  const backdrop = document.getElementById('action-drawer-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-expanded', 'false');
  selectedRow = null;
}

async function saveTracking(form, row) {
  const payload = {
    client_id: row.client_id,
    cycle_code: row.cycle_code,
    status: form.status.value,
    owner: form.owner.value.trim(),
    action_notes: form.action_notes.value.trim(),
    updated_at: new Date().toISOString(),
  };
  try {
    const res = await fetch('/api/operational/action_tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Falha ao salvar');
    const data = await res.json();
    patchLocalActionTracking(data.entry ?? payload);
    const hint = document.getElementById('track-save-hint');
    if (hint) hint.textContent = 'Salvo com sucesso.';
  } catch {
    const hint = document.getElementById('track-save-hint');
    if (hint) {
      hint.textContent =
        'Não foi possível persistir (host estático). Use npm run dev para salvar tracking.';
    }
  }
}

function bindDrawer(signal, onRefresh) {
  document.getElementById('action-drawer-close')?.addEventListener('click', closeActionDrawer, { signal });
  document.getElementById('action-drawer-backdrop')?.addEventListener('click', closeActionDrawer, {
    signal,
  });
  document.getElementById('action-tracking-form')?.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      if (selectedRow) await saveTracking(e.target, selectedRow);
      closeActionDrawer();
      onRefresh();
    },
    { signal },
  );
}

function bindTable(rows, signal, onRefresh) {
  document.querySelectorAll('.action-row').forEach((tr) => {
    const open = () => {
      const id = tr.dataset.clientId;
      const cycle = tr.dataset.cycle;
      const row = rows.find((r) => r.client_id === id && r.cycle_code === cycle);
      if (row) openActionDrawer(row);
    };
    tr.addEventListener('click', open, { signal });
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    }, { signal });
  });

  document.getElementById('action-search')?.addEventListener('change', (e) => {
    tableState.search = e.target.value;
    tableState.page = 1;
    onRefresh();
  }, { signal });
  document.getElementById('action-status-filter')?.addEventListener('change', (e) => {
    tableState.actionStatus = e.target.value;
    tableState.page = 1;
    onRefresh();
  }, { signal });
  document.getElementById('action-page-size')?.addEventListener('change', (e) => {
    tableState.pageSize = Number(e.target.value);
    tableState.page = 1;
    onRefresh();
  }, { signal });
  document.getElementById('action-page-prev')?.addEventListener('click', () => {
    tableState.page -= 1;
    onRefresh();
  }, { signal });
  document.getElementById('action-page-next')?.addEventListener('click', () => {
    tableState.page += 1;
    onRefresh();
  }, { signal });
  document.getElementById('action-export-csv')?.addEventListener('click', () => {
    const csv = buildActionPlanCsv(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plano-de-acao.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }, { signal });
  document.querySelectorAll('#action-plan-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (tableState.sortKey === key) tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        tableState.sortKey = key;
        tableState.sortDir = 'asc';
      }
      onRefresh();
    }, { signal });
  });
}

export function renderPlanoDeAcao(root, ctx = {}) {
  const signal = ctx.signal;
  const filters = getFilters();

  if (!hasActionPlanArtifacts()) {
    root.innerHTML = `
      <div class="gd-status" role="status">
        <p>Fila enriquecida indisponível. Execute <code>npm run generate:action-enriched</code> ou <code>npm run refresh:nps</code>.</p>
      </div>`;
    return;
  }

  const cycleCode = filters.cycleCode;
  const summary = getCycleSummary(cycleCode);
  const dataState = getDataState();
  const cutoff = formatDate(summary?.data_cutoff ?? dataState?.dataCutoff);
  const allRows = getActionPlanRows(cycleCode);
  const queueKpis = computeActionPlanKpis(allRows);
  const meta = getActionPlanMeta(cycleCode);

  function bindPriorityChips(host, chipSignal, onRefresh) {
    if (!host) return;
    const chipOpts = chipSignal ? { signal: chipSignal } : undefined;
    host.querySelectorAll('[data-priority]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          tableState.priorityFilter = btn.dataset.priority ?? '';
          tableState.page = 1;
          onRefresh();
        },
        chipOpts,
      );
    });
  }

  const rerenderTable = () => {
    const tableSignal = beginTableBindings();
    const f = getFilters();
    const rows = buildFilteredRows(f.cycleCode, f);
    const host = document.getElementById('action-table-host');
    if (host) {
      host.innerHTML = renderTable(rows);
      bindTable(rows, tableSignal, rerenderTable);
      bindDrawer(tableSignal, rerenderTable);
    }
    const chipsHost = document.getElementById('action-priority-chips');
    if (chipsHost) {
      chipsHost.outerHTML = renderPrioritySegments(getActionPlanRows(f.cycleCode));
      bindPriorityChips(document.getElementById('action-priority-chips'), tableSignal, rerenderTable);
    }
  };

  root.innerHTML = `
    <header class="page-header">
      <div>
        <p class="eyebrow">Plano de Ação</p>
        <h1 class="hero__title">Plano de Ação</h1>
        <p class="page-header__lead">Lista clientes priorizados para acompanhamento com base nos sinais identificados.</p>
      </div>
      <div class="chip-row">
        <span class="chip-modern">Atualizado ${escapeHtml(cutoff)}</span>
        <span class="chip-modern">${allRows.length} na fila analítica</span>
      </div>
    </header>
    <div id="action-kpi-host">
      <div class="metric-compact-grid">
        <article class="metric-compact"><div class="metric-compact__label">Alta prioridade</div><div class="metric-compact__value">${queueKpis.Alta}</div></article>
        <article class="metric-compact"><div class="metric-compact__label">Média prioridade</div><div class="metric-compact__value">${queueKpis.Média}</div></article>
        <article class="metric-compact"><div class="metric-compact__label">Investigar</div><div class="metric-compact__value">${queueKpis.Investigar}</div></article>
        <article class="metric-compact"><div class="metric-compact__label">Aprendizado</div><div class="metric-compact__value">${queueKpis.Aprendizado}</div></article>
        <article class="metric-compact"><div class="metric-compact__label">Ação pendente</div><div class="metric-compact__value">${queueKpis.pending}</div></article>
      </div>
    </div>
    <h2 class="section-title">Composição da fila</h2>
    <div id="action-funnel-host">${renderFunnel(queueKpis, allRows.length || 1)}</div>
    ${renderInvestigateSection(queueKpis)}
    ${renderPrioritySegments(allRows)}
    <h2 class="section-title">Fila nominal</h2>
    <div id="action-table-host"></div>
    <div class="quality-box">
      <h3>Como interpretar</h3>
      <ul>
        <li>Prioridades refletem regras sobre movimento de NPS e sinais de experiência — não inferência causal individual.</li>
        <li>Contexto de drivers populacionais, quando exibido, descreve associações na base, não causas por cliente.</li>
        <li>Status e responsável são operacionais e persistem separados da fila analítica regenerável.</li>
      </ul>
    </div>
  `;

  bindPriorityChips(document.getElementById('action-priority-chips'), signal, rerenderTable);

  if (signal) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeActionDrawer();
    }, { signal });
  }

  rerenderTable();
}
