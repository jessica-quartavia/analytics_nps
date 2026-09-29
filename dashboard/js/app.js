import {
  loadAnalyticsData,
  isLoaded,
  getLatestCycle,
  getCycles,
  getResponses,
  getCycleSummary,
  getDataState,
  getSnapshot,
  getExecutiveDiagnosis,
  hasVocArtifacts,
  getTopicFilterOptions,
  hasCsatArtifacts,
} from './data/analytics-store.js';
import {
  subscribeFilters,
  setFilter,
  getFilters,
  initDefaultCycle,
  getEpOptions,
} from './filters/global-filters.js';
import { renderExecutivo, closeDiagnosisDrawer } from './pages/executivo.js';
import { renderMovimento, closeDrawer } from './pages/movimento.js';
import { renderEps, closeEpDrawer } from './pages/eps.js';
import { renderVozDoCliente, closeVocDrawer } from './pages/voz-do-cliente.js';
import { renderDrivers, closeDriverDrawer } from './pages/drivers.js';
import { renderPlanoDeAcao, closeActionDrawer } from './pages/plano-de-acao.js';
import { beginFilterBindings, beginPageBindings } from './utils/page-bindings.js';
import { escapeHtml, escapeAttr } from './utils/escape-html.js';
import { formatDate, cycleStatusLabel } from './utils/format.js';
import {
  stickyFiltersEnabled,
  setStickyFiltersEnabled,
  applyStickyFiltersDom,
  mountFilterScrollWatch,
} from './utils/sticky-filters.js';
import { bindMethodologyTrigger, closeMethodologyDrawer } from './ui/methodology-drawer.js';

const ROUTES = {
  executivo: { title: 'Executivo', topbar: 'Visão executiva', render: renderExecutivo },
  movimento: { title: 'Movimento', topbar: 'Movimento', render: renderMovimento },
  eps: { title: 'Eng. Patrimoniais', topbar: 'Engenheiros Patrimoniais', render: renderEps },
  'voz-do-cliente': {
    title: 'Voz do Cliente',
    topbar: 'Voz do Cliente',
    render: renderVozDoCliente,
  },
  drivers: { title: 'Drivers', topbar: 'Drivers do NPS', render: renderDrivers },
  'plano-de-acao': {
    title: 'Plano de Ação',
    topbar: 'Plano de Ação',
    render: renderPlanoDeAcao,
  },
};

function getRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'executivo';
  return ROUTES[hash] ? hash : 'executivo';
}

function isVocRoute() {
  return getRoute() === 'voz-do-cliente';
}

function setNavActive(route) {
  document.querySelectorAll('[data-route]').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.route === route);
  });
}

function updateTopbar(route) {
  const titleEl = document.getElementById('topbar-title');
  const metaEl = document.getElementById('topbar-meta');
  if (!titleEl || !metaEl || !isLoaded()) return;

  titleEl.textContent = ROUTES[route]?.topbar ?? 'NPS';
  const filters = getFilters();
  const summary = getCycleSummary(filters.cycleCode);
  const dataState = getDataState();
  const snapshot = getSnapshot();
  const cutoff = formatDate(summary?.data_cutoff ?? dataState?.dataCutoff ?? snapshot?.data_cutoff);
  const status = cycleStatusLabel(summary?.status);
  const meth = snapshot?.methodology?.nps_method_version ?? '—';
  const staleHint =
    snapshot?.status && snapshot.status !== 'success'
      ? `<span class="topbar-chip topbar-chip--warn" title="Execute npm run refresh:nps">Refresh incompleto</span>`
      : '';

  metaEl.innerHTML = `
    <span class="topbar-chip" title="Dados atualizados até ${escapeAttr(cutoff)}">Atualizado ${escapeHtml(cutoff)}</span>
    <span class="topbar-chip" title="Versões em data/config/methodology.json">Metodologia v${escapeHtml(String(meth))}</span>
    ${staleHint}
    <span class="topbar-chip topbar-chip--status">${escapeHtml(status)}</span>
  `;
}

function renderFiltersBar() {
  const host = document.getElementById('filters-bar');
  if (!host || !isLoaded()) return;
  const signal = beginFilterBindings();
  const filters = getFilters();
  const cycles = getCycles();
  const responses = getResponses(filters.cycleCode);
  const eps = getEpOptions(responses);
  const stickyOn = stickyFiltersEnabled();
  const route = getRoute();
  const topicOptions =
    isVocRoute() && hasVocArtifacts() ? getTopicFilterOptions(filters.cycleCode) : [];
  const showTopicValence = topicOptions.length > 0;

  host.innerHTML = `
    <div class="filter-shell__fields">
      <div class="filter-field">
        <label for="filter-cycle">Ciclo</label>
        <select class="select-input" id="filter-cycle" aria-label="Filtrar por ciclo analítico">
          ${cycles
            .map(
              (c) =>
                `<option value="${escapeAttr(c.cycle_code)}" ${c.cycle_code === filters.cycleCode ? 'selected' : ''}>${escapeHtml(c.cycle_name)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-ep">EP</label>
        <select class="select-input" id="filter-ep" aria-label="Filtrar por engenheiro patrimonial">
          <option value="">Todos</option>
          ${eps.map((ep) => `<option value="${escapeAttr(ep)}" ${filters.ep === ep ? 'selected' : ''}>${escapeHtml(ep)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-category">Categoria</label>
        <select class="select-input" id="filter-category" aria-label="Filtrar por categoria NPS">
          <option value="">Todas</option>
          ${['Promotor', 'Neutro', 'Detrator']
            .map(
              (c) =>
                `<option value="${c}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="filter-field">
        <label>Nota</label>
        <div class="filter-range">
          <input class="text-input" id="filter-score-min" type="number" min="0" max="10" placeholder="0" value="${escapeAttr(filters.scoreMin)}" aria-label="Nota mínima" />
          <span class="filter-range__sep">—</span>
          <input class="text-input" id="filter-score-max" type="number" min="0" max="10" placeholder="10" value="${escapeAttr(filters.scoreMax)}" aria-label="Nota máxima" />
        </div>
      </div>
      <div class="filter-field">
        <label>Delta</label>
        <div class="filter-range">
          <input class="text-input" id="filter-delta-min" type="number" placeholder="-10" value="${escapeAttr(filters.deltaMin)}" aria-label="Delta mínimo" />
          <span class="filter-range__sep">—</span>
          <input class="text-input" id="filter-delta-max" type="number" placeholder="+10" value="${escapeAttr(filters.deltaMax)}" aria-label="Delta máximo" />
        </div>
      </div>
      <div class="filter-field">
        <label for="filter-base">Base</label>
        <select class="select-input" id="filter-base" aria-label="Base total ou pareada">
          <option value="total" ${filters.base === 'total' ? 'selected' : ''}>Total</option>
          <option value="paired" ${filters.base === 'paired' ? 'selected' : ''}>Pareada</option>
        </select>
      </div>
      ${
        showTopicValence
          ? `
      <div class="filter-field">
        <label for="filter-topic">Tema</label>
        <select class="select-input" id="filter-topic" aria-label="Filtrar por tema">
          <option value="">Todos</option>
          ${topicOptions.map((t) => `<option value="${escapeAttr(t)}" ${filters.topic === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-valence">Valência</label>
        <select class="select-input" id="filter-valence" aria-label="Filtrar por valência">
          <option value="">Todas</option>
          ${['Positiva', 'Neutra', 'Negativa']
            .map(
              (v) =>
                `<option value="${v}" ${filters.valence === v ? 'selected' : ''}>${escapeHtml(v)}</option>`,
            )
            .join('')}
        </select>
      </div>`
          : ''
      }
      ${
        (route === 'movimento' || route === 'plano-de-acao') && hasCsatArtifacts()
          ? `
      <div class="filter-field">
        <label for="filter-has-csat">Possui CSAT</label>
        <select class="select-input" id="filter-has-csat" aria-label="Filtrar clientes com CSAT">
          <option value="">Todos</option>
          <option value="yes" ${filters.hasCsat === 'yes' ? 'selected' : ''}>Sim</option>
          <option value="no" ${filters.hasCsat === 'no' ? 'selected' : ''}>Não</option>
        </select>
      </div>`
          : ''
      }
      ${
        route === 'voz-do-cliente'
          ? `
      <div class="filter-field filter-field--wide">
        <label for="filter-search">Busca</label>
        <input class="text-input" id="filter-search" type="search" placeholder="Cliente ou comentário" value="${escapeAttr(filters.search)}" aria-label="Busca textual" />
      </div>`
          : ''
      }
    </div>
    <div class="filter-shell__sticky">
      <span class="filter-sticky-label">Fixar filtros</span>
      <label class="switch" aria-label="Fixar barra de filtros durante a rolagem">
        <input type="checkbox" id="filter-sticky-switch" ${stickyOn ? 'checked' : ''} />
        <span class="switch__track"></span>
        <span class="switch__thumb"></span>
      </label>
    </div>
  `;

  applyStickyFiltersDom(stickyOn);

  const opts = { signal };
  host.querySelector('#filter-cycle')?.addEventListener('change', (e) => setFilter('cycleCode', e.target.value), opts);
  host.querySelector('#filter-ep')?.addEventListener('change', (e) => setFilter('ep', e.target.value), opts);
  host.querySelector('#filter-category')?.addEventListener('change', (e) => setFilter('category', e.target.value), opts);
  host.querySelector('#filter-score-min')?.addEventListener('change', (e) => setFilter('scoreMin', e.target.value), opts);
  host.querySelector('#filter-score-max')?.addEventListener('change', (e) => setFilter('scoreMax', e.target.value), opts);
  host.querySelector('#filter-delta-min')?.addEventListener('change', (e) => setFilter('deltaMin', e.target.value), opts);
  host.querySelector('#filter-delta-max')?.addEventListener('change', (e) => setFilter('deltaMax', e.target.value), opts);
  host.querySelector('#filter-base')?.addEventListener('change', (e) => setFilter('base', e.target.value), opts);
  host.querySelector('#filter-topic')?.addEventListener('change', (e) => setFilter('topic', e.target.value), opts);
  host.querySelector('#filter-valence')?.addEventListener('change', (e) => setFilter('valence', e.target.value), opts);
  host.querySelector('#filter-search')?.addEventListener('change', (e) => setFilter('search', e.target.value), opts);
  host.querySelector('#filter-has-csat')?.addEventListener('change', (e) => setFilter('hasCsat', e.target.value), opts);
  host.querySelector('#filter-sticky-switch')?.addEventListener(
    'change',
    (e) => {
      setStickyFiltersEnabled(e.target.checked);
      mountFilterScrollWatch(signal);
    },
    opts,
  );
}

function renderPage() {
  const route = getRoute();
  setNavActive(route);
  document.title = `NPS · ${ROUTES[route].title}`;
  updateTopbar(route);
  closeDrawer();
  closeEpDrawer();
  closeVocDrawer();
  closeDriverDrawer();
  closeActionDrawer();
  closeDiagnosisDrawer();
  closeMethodologyDrawer();
  const content = document.getElementById('page-content');
  if (!content) return;
  const signal = beginPageBindings();
  mountFilterScrollWatch(signal);
  ROUTES[route].render(content, { signal });
}

function showState(kind, messageHtml) {
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="gd-status ${kind === 'error' ? 'gd-status--error' : ''}" role="status"><p>${messageHtml}</p></div>`;
}

async function boot() {
  showState('loading', escapeHtml('Carregando dados analíticos…'));
  try {
    await loadAnalyticsData();
    bindMethodologyTrigger(() => ({
      snapshot: getSnapshot(),
      executiveDiagnosisDoc: getExecutiveDiagnosis(getFilters()?.cycleCode),
    }));
    const latest = getLatestCycle();
    initDefaultCycle(latest?.cycle_code);
    applyStickyFiltersDom();
    renderFiltersBar();
    mountFilterScrollWatch();
    subscribeFilters(() => {
      renderFiltersBar();
      updateTopbar(getRoute());
      renderPage();
    });
    window.addEventListener('hashchange', renderPage);
    renderPage();
  } catch (err) {
    console.error(err);
    let message;
    if (err?.code === 'DATASET_NOT_FOUND' && err.url) {
      message = `<strong>Dataset ausente no deploy (404):</strong> <code>${escapeHtml(err.url)}</code>. Verifique <code>npm run build</code> e se <code>data/deploy/public/</code> está no repositório.`;
    } else if (err?.code === 'INVALID_JSON' && err.url) {
      message = `<strong>JSON inválido:</strong> <code>${escapeHtml(err.url)}</code>.`;
    } else if (err?.code === 'FETCH_BLOCKED') {
      message = `<strong>Fetch bloqueado</strong> ao carregar datasets. Abra via HTTP (<code>npm run dev</code> ou deploy), não <code>file://</code>.`;
    } else if (err?.code === 'HTTP_ERROR' && err.url) {
      message = `<strong>Erro HTTP ${escapeHtml(String(err.status ?? ''))}:</strong> <code>${escapeHtml(err.url)}</code>.`;
    } else {
      message =
        'Os dados analíticos ainda não foram gerados. Execute o refresh do NPS (<code>npm run refresh:nps</code>) e <code>npm run sync:deploy-public</code> antes do build.';
    }
    showState('error', message);
  }
}

boot();
