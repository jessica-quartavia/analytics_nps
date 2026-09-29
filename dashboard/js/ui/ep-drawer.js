import {
  getEpResponses,
  getPairedCycles,
  getActionQueue,
  getClientSatisfaction,
} from '../data/analytics-store.js';
import { filterResponses } from '../data/store-core.mjs';
import { formatNps, formatPct, formatDeltaPts, formatCsatAverage } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { helpTip } from './help.js';
let drawerState = {
  entry: null,
  rows: [],
  actionQueue: [],
  cycleCode: '',
  minSample: 5,
  view: 'portfolio',
  selectedClientId: null,
  page: 1,
  pageSize: 25,
  search: '',
};

function formatIcRange(low, high) {
  if (low == null || high == null) return '—';
  return `${formatNps(low)}\u2013${formatNps(high)}`;
}

function categoryChip(cat) {
  const c = cat ?? '—';
  const slug =
    c === 'Promotor' ? 'promotor' : c === 'Neutro' ? 'neutro' : c === 'Detrator' ? 'detrator' : 'muted';
  return `<span class="nps-cat-chip nps-cat-chip--${slug}">${escapeHtml(c)}</span>`;
}

function priorityBadge(p) {
  if (!p || p === '—') return '<span class="note-muted">—</span>';
  return `<span class="priority-pill priority-pill--${escapeAttr(p)}">${escapeHtml(p)}</span>`;
}

function epApproxBadge(entry) {
  if ((entry.ep_low_confidence ?? 0) <= 0) return '';
  return '<span class="badge badge--method">EP aproximado</span>';
}

function kpiCard(label, value, sub = '', valueClass = '') {
  const vCls = valueClass ? ` ${valueClass}` : '';
  return `<article class="ep-drawer-kpi">
    <div class="ep-drawer-kpi__label">${escapeHtml(label)}</div>
    <div class="ep-drawer-kpi__value${vCls}">${escapeHtml(value ?? '—')}</div>
    ${sub ? `<div class="ep-drawer-kpi__sub">${escapeHtml(sub)}</div>` : ''}
  </article>`;
}

function miniCard(label, line) {
  return `<article class="ep-drawer-mini-card"><div class="ep-drawer-mini-card__label">${escapeHtml(label)}</div><div class="ep-drawer-mini-card__value">${escapeHtml(line)}</div></article>`;
}

function filteredClientRows() {
  const q = drawerState.search.trim().toLowerCase();
  let rows = drawerState.rows;
  if (q) {
    rows = rows.filter(
      (r) =>
        (r.client_name && r.client_name.toLowerCase().includes(q)) ||
        (r.client_code && r.client_code.toLowerCase().includes(q)),
    );
  }
  return rows;
}

function actionFor(clientId) {
  return drawerState.actionQueue.find((a) => a.client_id === clientId);
}

function renderPortfolioView(entry) {
  const total = entry.valid_responses || 1;
  const recPct =
    entry.recovered_detractors_denominator > 0
      ? `${entry.recovered_detractors} de ${entry.recovered_detractors_denominator}`
      : '—';
  const detPct =
    entry.deteriorated_promoters_denominator > 0
      ? `${entry.deteriorated_promoters} de ${entry.deteriorated_promoters_denominator}`
      : '—';

  const clients = filteredClientRows();
  const totalPages = Math.max(1, Math.ceil(clients.length / drawerState.pageSize));
  if (drawerState.page > totalPages) drawerState.page = totalPages;
  const start = (drawerState.page - 1) * drawerState.pageSize;
  const pageRows = clients.slice(start, start + drawerState.pageSize);

  const tbody = pageRows
    .map((r) => {
      const aq = actionFor(r.client_id);
      const pr = aq?.priority ?? '—';
      const delta = r.score_delta != null ? (r.score_delta > 0 ? `+${r.score_delta}` : String(r.score_delta)) : '—';
      return `<tr class="ep-drawer-client-row" data-client-id="${escapeAttr(r.client_id)}" tabindex="0">
        <td class="col-label">${escapeHtml(r.client_name ?? '—')}</td>
        <td class="num col-number">${escapeHtml(String(r.score ?? '—'))}</td>
        <td>${categoryChip(r.nps_category)}</td>
        <td class="num col-number">${escapeHtml(delta)}</td>
        <td class="col-small">${escapeHtml(r.nps_migration ?? '—')}</td>
        <td>${priorityBadge(pr)}</td>
        <td><button type="button" class="btn btn--ghost btn--sm ep-drawer-client-open" data-client-id="${escapeAttr(r.client_id)}">Ver</button></td>
      </tr>`;
    })
    .join('');

  return `
    <div class="ep-drawer-kpi-grid">
      ${kpiCard('NPS atual', formatNps(entry.nps))}
      ${kpiCard('IC95', formatIcRange(entry.nps_ci_low, entry.nps_ci_high), '', 'cell-nowrap')}
      ${kpiCard('Respostas', String(entry.valid_responses))}
      ${kpiCard('Taxa de resposta', entry.response_rate != null ? formatPct(entry.response_rate * 100, 1) : '—')}
      ${kpiCard('Base pareada', String(entry.paired_clients))}
      ${kpiCard('Delta pareado', formatDeltaPts(entry.current_nps_paired, entry.previous_nps_paired))}
    </div>

    <section class="ep-drawer-section">
      <h3 class="ep-drawer-section__title">Composição</h3>
      <div class="ep-drawer-mini-grid">
        ${miniCard('Promotores', `${entry.promoters} · ${formatPct((entry.promoters / total) * 100, 0)}`)}
        ${miniCard('Neutros', `${entry.passives} · ${formatPct((entry.passives / total) * 100, 0)}`)}
        ${miniCard('Detratores', `${entry.detractors} · ${formatPct((entry.detractors / total) * 100, 0)}`)}
      </div>
    </section>

    <section class="ep-drawer-section">
      <h3 class="ep-drawer-section__title">Movimentos</h3>
      <div class="ep-drawer-mini-grid ep-drawer-mini-grid--2">
        ${miniCard('Detratores recuperados', recPct)}
        ${miniCard('Promotores deteriorados', detPct)}
      </div>
    </section>

    <section class="ep-drawer-section">
      <h3 class="ep-drawer-section__title">${helpTip('Qualidade do vínculo EP', 'Indica a confiança na reconstrução do EP responsável no ciclo.')}</h3>
      <div class="ep-drawer-mini-grid ep-drawer-mini-grid--3">
        ${miniCard('Alta', String(entry.ep_high_confidence ?? 0))}
        ${miniCard('Média', String(entry.ep_medium_confidence ?? 0))}
        ${miniCard('Baixa', String(entry.ep_low_confidence ?? 0))}
      </div>
    </section>

    <section class="ep-drawer-section ep-drawer-section--table">
      <h3 class="ep-drawer-section__title">Clientes da carteira</h3>
      <div class="ep-drawer-table-toolbar">
        <input type="search" class="text-input" id="ep-drawer-search" placeholder="Buscar cliente" value="${escapeAttr(drawerState.search)}" aria-label="Buscar cliente" />
        <label>Por página
          <select class="select-input" id="ep-drawer-page-size" aria-label="Itens por página">
            ${[25, 50, 100].map((n) => `<option value="${n}" ${drawerState.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="table-scroll ep-drawer-table-scroll">
        <table class="gd-table analytic-table ep-drawer-clients-table">
          <thead><tr>
            <th class="col-label">Cliente</th>
            <th class="num col-number">Nota</th>
            <th class="col-category">Categoria</th>
            <th class="num col-number">Delta</th>
            <th class="col-small">Migração</th>
            <th>Prioridade</th>
            <th class="col-small">Ação</th>
          </tr></thead>
          <tbody>${tbody || '<tr><td colspan="7" class="placeholder-note">Sem clientes no recorte.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="table-pagination">
        <button type="button" class="btn btn--ghost" id="ep-drawer-page-prev" ${drawerState.page <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>${clients.length} clientes · pág. ${drawerState.page}/${totalPages}</span>
        <button type="button" class="btn btn--ghost" id="ep-drawer-page-next" ${drawerState.page >= totalPages ? 'disabled' : ''}>Próxima</button>
      </div>
    </section>`;
}

function renderClientDetail(clientId) {
  const r = drawerState.rows.find((x) => x.client_id === clientId);
  if (!r) return '<p class="placeholder-note">Cliente não encontrado.</p>';
  const aq = actionFor(clientId);
  const sat = getClientSatisfaction(clientId);
  const csatLine = sat?.has_csat
    ? `Média ${formatCsatAverage(sat.csat_average)} · última ${sat.latest_csat_score ?? '—'} (${sat.csat_responses_count ?? 0} resp.)`
    : 'Sem CSAT';

  const epNote =
    r.ep_resolution_confidence === 'low'
      ? '<span class="badge badge--method">EP aproximado</span>'
      : '<span class="note-muted">Vínculo EP confiável</span>';

  return `
    <button type="button" class="btn btn--ghost ep-drawer-back" id="ep-drawer-back">← Voltar para carteira</button>
    <h3 class="ep-drawer-client-name">${escapeHtml(r.client_name ?? 'Cliente')}</h3>
    <div class="ep-drawer-detail-grid">
      <div><span class="ep-drawer-detail__label">Nota atual / anterior</span><span class="ep-drawer-detail__value">${escapeHtml(String(r.score ?? '—'))} / ${escapeHtml(String(r.previous_score ?? '—'))}</span></div>
      <div><span class="ep-drawer-detail__label">Categoria</span>${categoryChip(r.nps_category)}</div>
      <div><span class="ep-drawer-detail__label">Delta</span><span class="ep-drawer-detail__value">${escapeHtml(r.score_delta ?? '—')}</span></div>
      <div><span class="ep-drawer-detail__label">Migração</span><span class="ep-drawer-detail__value">${escapeHtml(r.nps_migration ?? '—')}</span></div>
      <div><span class="ep-drawer-detail__label">Evolução</span><span class="ep-drawer-detail__value">${escapeHtml(r.evolution_status ?? '—')}</span></div>
      <div><span class="ep-drawer-detail__label">Prioridade</span>${priorityBadge(aq?.priority ?? '—')}</div>
      <div><span class="ep-drawer-detail__label">Tema principal</span><span class="ep-drawer-detail__value">${escapeHtml(aq?.primary_topic ?? '—')}</span></div>
      <div><span class="ep-drawer-detail__label">CSAT</span><span class="ep-drawer-detail__value">${escapeHtml(csatLine)}</span></div>
      <div><span class="ep-drawer-detail__label">Qualidade EP</span>${epNote}</div>
    </div>`;
}

function renderDrawerBody(entry) {
  const body =
    drawerState.view === 'client' && drawerState.selectedClientId
      ? renderClientDetail(drawerState.selectedClientId)
      : renderPortfolioView(entry);
  return body;
}

function paintDrawer(entry) {
  const drawer = document.getElementById('ep-drawer');
  if (!drawer) return;

  drawer.classList.add('drawer--ep');
  drawer.innerHTML = `
    <header class="drawer__header ep-drawer__header">
      <div class="drawer__header-text">
        <h2 class="drawer__title">${escapeHtml(entry.ep_name)}</h2>
        <div class="ep-drawer__badges">${epApproxBadge(entry)}</div>
      </div>
      <button type="button" class="drawer__close" id="ep-drawer-close" aria-label="Fechar painel">×</button>
    </header>
    <div class="drawer__body ep-drawer__body" id="ep-drawer-body">${renderDrawerBody(entry)}</div>`;
}

let epDrawerAbort = null;

function bindDrawerEvents(entry, filters, pairedSet) {
  epDrawerAbort?.abort();
  epDrawerAbort = new AbortController();
  const { signal } = epDrawerAbort;

  const drawer = document.getElementById('ep-drawer');
  const backdrop = document.getElementById('ep-drawer-backdrop');
  const refresh = () => paintDrawer(entry);

  drawer.querySelector('#ep-drawer-close')?.addEventListener('click', closeEpDrawerFromUI, { signal });
  backdrop?.addEventListener('click', closeEpDrawerFromUI, { signal });

  drawer.querySelector('#ep-drawer-back')?.addEventListener(
    'click',
    () => {
      drawerState.view = 'portfolio';
      drawerState.selectedClientId = null;
      refresh();
      bindDrawerEvents(entry, filters, pairedSet);
    },
    { signal },
  );

  drawer.querySelector('#ep-drawer-search')?.addEventListener(
    'input',
    (e) => {
      drawerState.search = e.target.value;
      drawerState.page = 1;
      refresh();
      bindDrawerEvents(entry, filters, pairedSet);
    },
    { signal },
  );

  drawer.querySelector('#ep-drawer-page-size')?.addEventListener(
    'change',
    (e) => {
      drawerState.pageSize = Number(e.target.value);
      drawerState.page = 1;
      refresh();
      bindDrawerEvents(entry, filters, pairedSet);
    },
    { signal },
  );

  drawer.querySelector('#ep-drawer-page-prev')?.addEventListener(
    'click',
    () => {
      drawerState.page -= 1;
      refresh();
      bindDrawerEvents(entry, filters, pairedSet);
    },
    { signal },
  );

  drawer.querySelector('#ep-drawer-page-next')?.addEventListener(
    'click',
    () => {
      drawerState.page += 1;
      refresh();
      bindDrawerEvents(entry, filters, pairedSet);
    },
    { signal },
  );

  const openClient = (id) => {
    drawerState.view = 'client';
    drawerState.selectedClientId = id;
    refresh();
    bindDrawerEvents(entry, filters, pairedSet);
  };

  drawer.querySelectorAll('.ep-drawer-client-open').forEach((btn) => {
    btn.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        openClient(btn.dataset.clientId);
      },
      { signal },
    );
  });

  drawer.querySelectorAll('.ep-drawer-client-row').forEach((tr) => {
    tr.addEventListener('click', () => openClient(tr.dataset.clientId), { signal });
    tr.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openClient(tr.dataset.clientId);
        }
      },
      { signal },
    );
  });
}

export function closeEpDrawerFromUI() {
  epDrawerAbort?.abort();
  epDrawerAbort = null;
  const backdrop = document.getElementById('ep-drawer-backdrop');
  const drawer = document.getElementById('ep-drawer');
  backdrop?.classList.remove('is-open');
  drawer?.classList.remove('is-open', 'drawer--ep');
  backdrop?.setAttribute('aria-hidden', 'true');
  backdrop?.setAttribute('aria-expanded', 'false');
  drawer?.setAttribute('aria-hidden', 'true');
  drawerState.view = 'portfolio';
  drawerState.selectedClientId = null;
}

export function openEpDrawerFromUI(entry, { cycleCode, filters, minSample }) {
  const paired = getPairedCycles(cycleCode);
  const pairedSet = filters.base === 'paired' ? new Set(paired?.paired_client_ids ?? []) : null;
  let rows = getEpResponses(cycleCode, entry.ep_id ?? entry.ep_name);
  rows = filterResponses(rows, { ...filters, ep: '' }, { pairedClientIds: pairedSet });

  drawerState = {
    entry,
    rows,
    actionQueue: getActionQueue(cycleCode),
    cycleCode,
    minSample,
    view: 'portfolio',
    selectedClientId: null,
    page: 1,
    pageSize: 25,
    search: '',
  };

  const backdrop = document.getElementById('ep-drawer-backdrop');
  const drawer = document.getElementById('ep-drawer');
  paintDrawer(entry);
  backdrop?.classList.add('is-open');
  drawer?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  backdrop?.setAttribute('aria-expanded', 'true');
  drawer?.setAttribute('aria-hidden', 'false');
  drawer?.focus();
  bindDrawerEvents(entry, filters, pairedSet);
}
