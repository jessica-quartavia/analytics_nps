import {
  getActionPlanRows,
  hasActionPlanArtifacts,
  getCycleSummary,
  getDataState,
  getTopicFilterOptions,
  getResponses,
  loadAnalyticsData,
} from '../data/analytics-store.js';
import { getFilters, getEpOptions } from '../filters/global-filters.js';
import {
  filterActionPlanRows,
  computeActionPlanKpis,
  sortActionPlanRows,
  buildActionPlanCsv,
  isCriticalAttentionRow,
} from '../data/store-core.mjs';
import { formatDate } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { TIPS, helpTip } from '../ui/help.js';
import { renderDataSourceNotice } from '../ui/data-source-notice.mjs';
import {
  renderActionOperationalDrawer,
  bindActionOperationalDrawer,
} from '../ui/action-operational-drawer.mjs';
import {
  cell,
  primaryTheme,
  resolveActionPriority,
  resolveRowProgram,
  hasActionProposal,
} from '../ui/action-display-helpers.mjs';
import { openActionPlanModal } from '../ui/action-plan-modal.mjs';

const PRIORITIES = ['Crítica', 'Alta', 'Média', 'Baixa', 'Acompanhamento positivo'];
const VALENCE_OPTIONS = ['Negativa', 'Neutra', 'Positiva'];

let tableState = {
  page: 1,
  pageSize: 25,
  sortKey: 'priority',
  sortDir: 'desc',
  search: '',
  priorityFilter: '',
  valenceFilter: '',
  epFilter: '',
  programFilter: '',
  categoryFilter: '',
  topicFilter: '',
  planHasFilter: '',
};
let tableController = null;
let selectedRow = null;
let pendingHashOpen = null;

function beginTableBindings() {
  tableController?.abort();
  tableController = new AbortController();
  return tableController.signal;
}

function priorityPill(p) {
  const label = p ?? '—';
  const cls =
    label === 'Crítica'
      ? 'priority-pill--critica'
      : label === 'Acompanhamento positivo'
        ? 'priority-pill--Acompanhamento positivo'
        : `priority-pill--${escapeAttr(label)}`;
  return `<span class="priority-pill ${cls}">${escapeHtml(label)}</span>`;
}

function qualitativeBadge(row) {
  if (!row.qualitative_signal) return '';
  return `<span class="qualitative-badge">${helpTip('Sinal qualitativo', TIPS.sinalQualitativo)}</span>`;
}

function epBadge(confidence) {
  if (confidence !== 'low') return '';
  return '<span class="ep-badge" title="EP reconstruído (proxy).">EP aproximado</span>';
}

function renderPriorityAiNotice() {
  return `<div class="voc-ai-notice voc-ai-notice--priority" role="note">
    <div class="voc-ai-notice__body">
      <p class="voc-ai-notice__title"><strong>🤖 Classificação de prioridade por IA</strong></p>
      <p class="voc-ai-notice__text">A prioridade é sugerida automaticamente com base nos dados do cliente. Você pode corrigir manualmente sempre que necessário.</p>
      <p class="note-muted voc-ai-notice__hint">O plano de ação continua sendo registrado manualmente nesta página.</p>
    </div>
  </div>`;
}

function collectEpOptions(rows, cycleCode) {
  const cycleResponses = getResponses(cycleCode);
  const set = new Set(getEpOptions(Array.isArray(cycleResponses) ? cycleResponses : []));
  for (const r of rows) if (r.ep_name) set.add(r.ep_name);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function collectProgramOptions(rows) {
  const set = new Set();
  for (const r of rows) {
    const p = resolveRowProgram(r);
    if (p && p !== '—') set.add(p);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function collectCategoryOptions(rows) {
  return [...new Set(rows.map((r) => r.current_category).filter(Boolean))].sort();
}

function buildFilteredRows(cycleCode, filters, { includePriority = true } = {}) {
  const all = getActionPlanRows(cycleCode);
  const planFilters = { ...filters, priority: '' };
  return filterActionPlanRows(all, planFilters, {
    search: tableState.search,
    priority: includePriority && tableState.priorityFilter ? tableState.priorityFilter : '',
    valence: tableState.valenceFilter,
    ep: tableState.epFilter,
    program: tableState.programFilter,
    category: tableState.categoryFilter,
    topic: tableState.topicFilter,
    planHas: tableState.planHasFilter,
  });
}

function findActionRow(cycleCode, { clientId, responseId, cycle }) {
  const rows = getActionPlanRows(cycleCode);
  return (
    rows.find(
      (r) =>
        r.client_id === clientId &&
        (responseId ? r.response_id === responseId : true) &&
        (cycle ? r.cycle_code === cycle : true),
    ) ??
    rows.find((r) => r.client_id === clientId) ??
    null
  );
}

function planRowButtonLabel(row) {
  return hasActionProposal(row) ? 'Ver/editar plano' : 'Criar plano';
}

function openActionDrawer(row) {
  selectedRow = row;
  const drawer = document.getElementById('action-drawer');
  const backdrop = document.getElementById('action-drawer-backdrop');
  if (!drawer || !row) return;

  drawer.innerHTML = renderActionOperationalDrawer(row);
  drawer.classList.add('is-open', 'drawer--wide');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-expanded', 'true');

  const refreshRow = (clientId, cycleCode) => {
    const fresh = findActionRow(getFilters().cycleCode, { clientId, cycle: cycleCode });
    if (fresh) {
      selectedRow = fresh;
      drawer.innerHTML = renderActionOperationalDrawer(fresh);
      bindActionOperationalDrawer(fresh, drawer, { onRefresh: refreshRow });
      bindDrawerClose();
    }
  };

  bindActionOperationalDrawer(row, drawer, { onRefresh: refreshRow });
  bindDrawerClose();
  drawer.focus();
}

function bindDrawerClose() {
  document.getElementById('action-drawer-close')?.addEventListener('click', closeActionDrawer, {
    once: true,
  });
  document.getElementById('action-drawer-backdrop')?.addEventListener('click', closeActionDrawer, {
    once: true,
  });
}

export function openActionPlanFromHashParams(params) {
  pendingHashOpen = {
    clientId: params.get('client_id'),
    responseId: params.get('response_id'),
    cycle: params.get('cycle'),
    open: params.get('open') === '1' || params.get('open') === 'true',
    openPlan: params.get('open') === 'plan' || params.get('modal') === 'plan',
  };
}

export function tryOpenPendingActionDrawer(cycleCode) {
  if (!pendingHashOpen?.clientId) return;
  const row = findActionRow(cycleCode, pendingHashOpen);
  const openPlan = pendingHashOpen.openPlan;
  const openDrawer = pendingHashOpen.open;
  pendingHashOpen = null;
  if (!row) return;
  if (openPlan) {
    openActionPlanModal(row, { mode: 'edit' });
    return;
  }
  if (openDrawer) openActionDrawer(row);
}

export function closeActionDrawer() {
  const drawer = document.getElementById('action-drawer');
  drawer?.classList.remove('is-open', 'drawer--wide');
  const backdrop = document.getElementById('action-drawer-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-expanded', 'false');
  selectedRow = null;
}

function bindTable(rows, signal, onRefresh) {
  document.querySelectorAll('.action-row').forEach((tr) => {
    const open = (e) => {
      if (e.target.closest('.action-row-plan-btn')) return;
      const id = tr.dataset.clientId;
      const cycle = tr.dataset.cycle;
      const row = rows.find((r) => r.client_id === id && r.cycle_code === cycle);
      if (row) openActionDrawer(row);
    };
    tr.addEventListener('click', open, { signal });
    tr.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(e);
        }
      },
      { signal },
    );
  });

  document.querySelectorAll('.action-row-plan-btn').forEach((btn) => {
    btn.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        const tr = btn.closest('.action-row');
        const id = tr?.dataset.clientId;
        const cycle = tr?.dataset.cycle;
        const row = rows.find((r) => r.client_id === id && r.cycle_code === cycle);
        if (!row) return;
        openActionPlanModal(row, {
          mode: 'edit',
          onSaved: async () => {
            try {
              await loadAnalyticsData();
            } catch {
              /* ok */
            }
            onRefresh();
          },
        });
      },
      { signal },
    );
  });

  const bindChange = (id, key) => {
    document.getElementById(id)?.addEventListener(
      'change',
      (e) => {
        tableState[key] = e.target.value;
        tableState.page = 1;
        onRefresh();
      },
      { signal },
    );
  };

  document.getElementById('action-search')?.addEventListener(
    'change',
    (e) => {
      tableState.search = e.target.value;
      tableState.page = 1;
      onRefresh();
    },
    { signal },
  );
  bindChange('action-priority-filter', 'priorityFilter');
  bindChange('action-ep-filter', 'epFilter');
  bindChange('action-program-filter', 'programFilter');
  bindChange('action-category-filter', 'categoryFilter');
  bindChange('action-topic-filter', 'topicFilter');
  bindChange('action-valence-filter', 'valenceFilter');
  bindChange('action-plan-has-filter', 'planHasFilter');
  document.getElementById('action-page-size')?.addEventListener(
    'change',
    (e) => {
      tableState.pageSize = Number(e.target.value);
      tableState.page = 1;
      onRefresh();
    },
    { signal },
  );
  document.getElementById('action-page-prev')?.addEventListener(
    'click',
    () => {
      tableState.page -= 1;
      onRefresh();
    },
    { signal },
  );
  document.getElementById('action-page-next')?.addEventListener(
    'click',
    () => {
      tableState.page += 1;
      onRefresh();
    },
    { signal },
  );
  document.getElementById('action-export-csv')?.addEventListener(
    'click',
    () => {
      const csv = buildActionPlanCsv(rows);
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'plano-de-acao.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    },
    { signal },
  );
  document.querySelectorAll('#action-plan-table th[data-sort]').forEach((th) => {
    th.addEventListener(
      'click',
      () => {
        const key = th.dataset.sort;
        if (tableState.sortKey === key) tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          tableState.sortKey = key;
          tableState.sortDir = 'asc';
        }
        onRefresh();
      },
      { signal },
    );
  });
}

function renderKpiStrip(kpis) {
  return `
    <div class="metric-compact-grid metric-compact-grid--action-priority">
      <article class="metric-compact metric-compact--priority"><div class="metric-compact__label">Prioridade crítica</div><div class="metric-compact__value">${kpis.Crítica ?? 0}</div></article>
      <article class="metric-compact metric-compact--priority"><div class="metric-compact__label">Prioridade alta</div><div class="metric-compact__value">${kpis.Alta ?? 0}</div></article>
      <article class="metric-compact metric-compact--priority"><div class="metric-compact__label">Prioridade média</div><div class="metric-compact__value">${kpis.Média ?? 0}</div></article>
      <article class="metric-compact metric-compact--priority"><div class="metric-compact__label">Prioridade baixa</div><div class="metric-compact__value">${kpis.Baixa ?? 0}</div></article>
    </div>
    <div class="metric-compact-grid metric-compact-grid--action-secondary">
      <article class="metric-compact metric-compact--muted"><div class="metric-compact__label">Planos criados</div><div class="metric-compact__value">${kpis.withPlan ?? 0}</div></article>
      <article class="metric-compact metric-compact--muted"><div class="metric-compact__label">Sem plano</div><div class="metric-compact__value">${kpis.withoutPlan ?? 0}</div></article>
    </div>`;
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

  const rerenderTable = () => {
    const tableSignal = beginTableBindings();
    const f = getFilters();
    const rows = buildFilteredRows(f.cycleCode, f);
    const host = document.getElementById('action-table-host');
    if (host) {
      host.innerHTML = renderTableHtml(rows);
      bindTable(rows, tableSignal, rerenderTable);
    }
    const kpiHost = document.getElementById('action-kpi-host');
    if (kpiHost) {
      kpiHost.innerHTML = renderKpiStrip(computeActionPlanKpis(getActionPlanRows(f.cycleCode)));
    }
  };

  function renderTableHtml(rows) {
    const epOptions = collectEpOptions(rows, getFilters().cycleCode);
    const programOptions = collectProgramOptions(rows);
    const categoryOptions = collectCategoryOptions(rows);
    const topicOptions = getTopicFilterOptions();
    const sorted = sortActionPlanRows(rows, tableState.sortKey, tableState.sortDir);
    const total = sorted.length;
    const pages = Math.max(1, Math.ceil(total / tableState.pageSize));
    if (tableState.page > pages) tableState.page = pages;
    const start = (tableState.page - 1) * tableState.pageSize;
    const pageRows = sorted.slice(start, start + tableState.pageSize);

    const body = pageRows.length
      ? pageRows
          .map((r) => {
            const finalP = resolveActionPriority(r);
            const crit = isCriticalAttentionRow(r) ? ' action-row--critical' : '';
            const planBtnClass = hasActionProposal(r)
              ? 'btn btn--secondary btn--sm action-row-plan-btn'
              : 'btn btn--primary btn--sm action-row-plan-btn';
            const program = resolveRowProgram(r);
            return `
      <tr class="action-row${crit}" data-client-id="${escapeAttr(r.client_id)}" data-cycle="${escapeAttr(r.cycle_code)}" data-response-id="${escapeAttr(r.response_id ?? '')}" tabindex="0">
        <td class="col-client">${escapeHtml(r.client_name ?? '—')}</td>
        <td class="col-ep">${escapeHtml(cell(r.ep_name))}${epBadge(r.ep_resolution_confidence)}</td>
        <td class="col-program">${escapeHtml(program)}</td>
        <td class="num">${cell(r.previous_score)}</td>
        <td class="num">${cell(r.current_score)}</td>
        <td class="num">${cell(r.score_delta)}</td>
        <td>${escapeHtml(cell(r.nps_migration))}</td>
        <td class="col-theme">${escapeHtml(primaryTheme(r))}</td>
        <td class="col-priority">${priorityPill(finalP)}${qualitativeBadge(r)}</td>
        <td class="col-plan">
          <button type="button" class="${planBtnClass}" data-action="open-plan">${escapeHtml(planRowButtonLabel(r))}</button>
        </td>
      </tr>`;
          })
          .join('')
      : `<tr><td colspan="10" class="placeholder-note">${escapeHtml(
          tableState.priorityFilter
            ? `Nenhum cliente classificado como ${tableState.priorityFilter} neste ciclo.`
            : 'Nenhum cliente neste recorte.',
        )}</td></tr>`;

    return `
    <div class="table-toolbar table-toolbar--action">
      <label class="filter-field">Busca
        <input class="text-input" id="action-search" type="search" placeholder="Cliente, EP ou motivo" value="${escapeAttr(tableState.search)}" />
      </label>
      <label class="filter-field">EP
        <select class="select-input" id="action-ep-filter">
          <option value="">Todos</option>
          ${epOptions.map((ep) => `<option value="${escapeAttr(ep)}" ${tableState.epFilter === ep ? 'selected' : ''}>${escapeHtml(ep)}</option>`).join('')}
        </select>
      </label>
      <label class="filter-field">Programa
        <select class="select-input" id="action-program-filter">
          <option value="">Todos</option>
          ${programOptions.map((p) => `<option value="${escapeAttr(p)}" ${tableState.programFilter === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
      </label>
      <label class="filter-field">Categoria NPS
        <select class="select-input" id="action-category-filter">
          <option value="">Todas</option>
          ${categoryOptions.map((c) => `<option value="${escapeAttr(c)}" ${tableState.categoryFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </label>
      <label class="filter-field">Tema VoC
        <select class="select-input" id="action-topic-filter">
          <option value="">Todos</option>
          ${topicOptions.map((t) => `<option value="${escapeAttr(t.value)}" ${tableState.topicFilter === t.value ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
        </select>
      </label>
      <label class="filter-field">Valência VoC
        <select class="select-input" id="action-valence-filter">
          <option value="">Todas</option>
          ${VALENCE_OPTIONS.map((s) => `<option value="${escapeAttr(s)}" ${tableState.valenceFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </label>
      <label class="filter-field">Prioridade
        <select class="select-input" id="action-priority-filter">
          <option value="">Todas</option>
          ${PRIORITIES.map((p) => `<option value="${escapeAttr(p)}" ${tableState.priorityFilter === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
      </label>
      <label class="filter-field">Plano
        <select class="select-input" id="action-plan-has-filter">
          <option value="">Todos</option>
          <option value="yes" ${tableState.planHasFilter === 'yes' ? 'selected' : ''}>Com plano</option>
          <option value="no" ${tableState.planHasFilter === 'no' ? 'selected' : ''}>Sem plano</option>
        </select>
      </label>
      <label class="filter-field">Por página
        <select class="select-input" id="action-page-size">
          ${[25, 50, 100].map((n) => `<option value="${n}" ${tableState.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="btn btn--secondary" id="action-export-csv">Exportar CSV</button>
    </div>
    <div class="table-scroll table-scroll--action">
      <table class="data-table data-table--action data-table--action-primary" id="action-plan-table">
        <thead><tr>
          <th class="col-client" data-sort="client_name">Cliente</th>
          <th class="col-ep" data-sort="ep_name">EP</th>
          <th class="col-program" data-sort="program">Programa</th>
          <th class="num" data-sort="previous_score">Nota anterior</th>
          <th class="num" data-sort="current_score">Nota atual</th>
          <th class="num" data-sort="score_delta">Δ</th>
          <th data-sort="nps_migration">Migração</th>
          <th class="col-theme">Tema principal</th>
          <th data-sort="priority">${helpTip('Prioridade', TIPS.prioridadeAlta)}</th>
          <th class="col-plan">Plano de ação</th>
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

  const lead =
    'Priorize clientes, registre planos de ação manualmente, corrija prioridade e VoC quando necessário, e exporte o dossiê em PDF.';

  root.innerHTML = `
    <header class="page-header page-header--action">
      <div>
        <p class="eyebrow">Plano de Ação</p>
        <h1 class="hero__title">Plano de Ação</h1>
        <p class="page-header__lead">${escapeHtml(lead)}</p>
        <div class="page-header__badges">
          <span class="badge badge--neutral-soft">NPS</span>
          <span class="badge badge--neutral-soft">VoC</span>
          <span class="badge badge--neutral-soft">Manual</span>
        </div>
      </div>
      <div class="chip-row">
        <span class="chip-modern">Atualizado ${escapeHtml(cutoff)}</span>
        <span class="chip-modern">${allRows.length} na fila</span>
      </div>
    </header>
    ${renderDataSourceNotice('plano-de-acao')}
    <div id="action-kpi-host">${renderKpiStrip(queueKpis)}</div>
    ${renderPriorityAiNotice()}
    <h2 class="section-title section-title--compact">Fila de clientes</h2>
    <div id="action-table-host"></div>
    <div class="quality-box quality-box--compact">
      <h3>Como interpretar</h3>
      <ul>
        <li>O plano de ação é registrado manualmente; revise o texto antes de salvar.</li>
        <li>Correções de prioridade e VoC prevalecem sobre sugestões automáticas.</li>
        <li>Nota NPS e comentário original não são alterados nesta página.</li>
      </ul>
    </div>
  `;

  if (signal) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') closeActionDrawer();
      },
      { signal },
    );
  }

  rerenderTable();
  tryOpenPendingActionDrawer(cycleCode);
}
