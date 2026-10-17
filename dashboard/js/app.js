import {
  loadAnalyticsData,
  bootstrapAnalyticsStaticShell,
  startBackgroundAnalyticsRefresh,
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
  getPopulationAudit,
  getPairedCycles,
  getNpsChangeDrivers,
  getNpsAllPeriodsDoc,
  getDataFreshness,
} from './data/analytics-store.js';
import {
  startDashboardRefreshController,
  refreshDashboardNow,
} from './data/dashboard-refresh-controller.mjs';
import { showNpsPeriodFilter, buildNpsPeriodSelectOptions } from './filters/nps-period.mjs';
import {
  subscribeFilters,
  setFilter,
  setFilters,
  getFilters,
  initDefaultCycle,
  getEpOptions,
} from './filters/global-filters.js';
import { renderExecutivo, closeDiagnosisDrawer } from './pages/executivo.js';
import { renderMovimento, closeDrawer } from './pages/movimento.js';
import { renderEps, closeEpDrawer } from './pages/eps.js';
import { renderVozDoCliente, closeVocDrawer } from './pages/voz-do-cliente.js';
import { renderDrivers, closeDriverDrawer } from './pages/drivers.js';
import {
  renderPlanoDeAcao,
  closeActionDrawer,
  openActionPlanFromHashParams,
} from './pages/plano-de-acao.js';
import { renderJornadaPerfil } from './pages/jornada-perfil.js';
import { renderPrevisaoNpsStub } from './pages/previsao-nps-stub.js';
import { renderSafrasCobertura, closeSafrasDrawer } from './pages/safras-cobertura.js';
import { renderSistemaDocumentacao } from './pages/sistema-documentacao.js';
import { renderSistemaLogs } from './pages/sistema-logs.js';
import { beginFilterBindings, beginPageBindings } from './utils/page-bindings.js';
import { escapeHtml, escapeAttr } from './utils/escape-html.js';
import { formatDate } from './utils/format.js';
import {
  renderDashboardDataStatus,
  bindDashboardDataStatus,
} from './ui/dashboard-data-status.mjs';
import {
  stickyFiltersEnabled,
  setStickyFiltersEnabled,
  applyStickyFiltersDom,
  mountFilterScrollWatch,
} from './utils/sticky-filters.js';
import { bindMethodologyTrigger, closeMethodologyDrawer } from './ui/methodology-drawer.js';
import { setThemeProfileFilters } from './filters/theme-profile-filters.mjs';
import {
  initDashboardAccess,
  renderAccessGateHtml,
  bindAccessGateEvents,
  getAuthSessionUser,
  signOutDashboard,
  loadDashboardAuthConfig,
} from './auth/dashboard-auth.mjs';

let dashboardAuthRequired = false;
let refreshToastTimer = null;

function showDashboardToast(message, { variant = 'neutral' } = {}) {
  let el = document.getElementById('dashboard-refresh-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dashboard-refresh-toast';
    el.className = 'dashboard-refresh-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('dashboard-refresh-toast--error', variant === 'error');
  el.classList.add('is-visible');
  if (refreshToastTimer) clearTimeout(refreshToastTimer);
  refreshToastTimer = setTimeout(() => el.classList.remove('is-visible'), 5000);
}

const ROUTES = {
  executivo: { title: 'Executivo', topbar: 'Visão executiva', render: renderExecutivo },
  movimento: { title: 'Movimento', topbar: 'Movimento', render: renderMovimento },
  eps: { title: 'Eng. Patrimoniais', topbar: 'Engenheiros Patrimoniais', render: renderEps },
  'voz-do-cliente': {
    title: 'Voz do Cliente',
    topbar: 'Voz do Cliente',
    render: renderVozDoCliente,
  },
  'jornada-perfil': {
    title: 'Jornada & Perfil',
    topbar: 'Jornada & Perfil',
    render: renderJornadaPerfil,
  },
  'safras-cobertura': {
    title: 'Safras & Cobertura',
    topbar: 'Safras & Cobertura',
    render: renderSafrasCobertura,
  },
  drivers: { title: 'Drivers', topbar: 'Drivers do NPS', render: renderDrivers },
  'plano-de-acao': {
    title: 'Plano de Ação',
    topbar: 'Plano de Ação',
    render: renderPlanoDeAcao,
  },
  'previsao-nps': {
    title: 'Projeção NPS',
    topbar: 'Projeção NPS',
    render: renderPrevisaoNpsStub,
  },
  'sistema/documentacao': {
    title: 'Documentação',
    topbar: 'Sistema · Documentação',
    render: renderSistemaDocumentacao,
  },
  'sistema/logs': {
    title: 'Logs',
    topbar: 'Sistema · Logs',
    render: renderSistemaLogs,
  },
};

const LAZY_ROUTE_META = {
  'historico-nps': { title: 'Histórico NPS', topbar: 'Histórico NPS' },
  'nps-historico': { title: 'NPS Histórico', topbar: 'NPS Histórico' },
  'historico-2': { title: 'NPS Histórico', topbar: 'NPS Histórico' },
};

/** @type {import('./pages/historico-nps.js') | null} */
let historicoNpsModule = null;

async function ensureHistoricoNpsModule() {
  if (!historicoNpsModule) {
    historicoNpsModule = await import('./pages/historico-nps.js');
  }
  return historicoNpsModule;
}

function closeHistoricoDrawer() {
  historicoNpsModule?.closeHistoricoDrawer?.();
}

/** @type {import('./pages/nps-historico.js') | null} */
let historico2Module = null;

async function ensureHistorico2Module() {
  if (!historico2Module) {
    const moduleUrl = new URL('./pages/nps-historico.js', import.meta.url).href;
    try {
      historico2Module = await import('./pages/nps-historico.js');
    } catch (err) {
      console.error('[NPS Histórico import failed]', { moduleUrl, error: err });
      throw err;
    }
  }
  return historico2Module;
}

function closeHistorico2Drawer() {
  historico2Module?.closeHistorico2Drawer?.();
}

function routeMeta(route) {
  return ROUTES[route] ?? LAZY_ROUTE_META[route] ?? ROUTES.executivo;
}

function isKnownRoute(routeKey) {
  return Boolean(ROUTES[routeKey] || LAZY_ROUTE_META[routeKey]);
}

function parseHashRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'executivo';
  const [pathPart] = raw.split('#');
  let [routeKey, queryString] = pathPart.split('?');
  if (routeKey === 'historico-2') {
    const suffix = queryString ? `?${queryString}` : '';
    if (location.hash !== `#/nps-historico${suffix}`) {
      history.replaceState(null, '', `#/nps-historico${suffix}`);
    }
    routeKey = 'nps-historico';
  }
  const route = isKnownRoute(routeKey) ? routeKey : 'executivo';
  const params = new URLSearchParams(queryString ?? '');
  return { route, params };
}

function getRoute() {
  return parseHashRoute().route;
}

function applyHashQueryToFilters() {
  const { route, params } = parseHashRoute();
  const tema = params.get('tema') || params.get('topic');
  const valencia = params.get('valencia') || params.get('valence');
  if (route === 'jornada-perfil' && (tema || valencia)) {
    setThemeProfileFilters({
      ...(tema ? { theme: tema } : {}),
      valence: valencia || 'Todas',
    });
    return;
  }
  if (tema || valencia) {
    setFilters({
      ...(tema ? { topic: tema } : {}),
      ...(valencia ? { valence: valencia } : {}),
    });
  }
  if (route === 'plano-de-acao') {
    openActionPlanFromHashParams(params);
    const cycle = params.get('cycle');
    if (cycle) setFilter('cycleCode', cycle);
  }
}

function isVocRoute() {
  return getRoute() === 'voz-do-cliente';
}

function showTopicValenceFilters(route) {
  return route === 'voz-do-cliente' && hasVocArtifacts();
}

function setNavActive(route) {
  document.querySelectorAll('[data-route]').forEach((a) => {
    const active = a.dataset.route === route;
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function runtimeRefreshErrorMessage(error) {
  const code = error?.code ?? error?.payload?.code;
  if (code === 'BASE_QV_INVALID_KEY') {
    return 'Runtime BASE QV indisponível: a chave configurada no servidor é anon — use a chave secreta do projeto BASE QV (Settings → API).';
  }
  if (code === 'BASE_QV_UNAVAILABLE') {
    return 'Runtime BASE QV indisponível: configure as variáveis BASE QV no servidor (URL + chave secreta).';
  }
  if (code === 'RUNTIME_REQUIRED_FAILED') {
    return 'Runtime BASE QV indisponível.';
  }
  if (code === 'RUNTIME_TIMEOUT') {
    return 'Não foi possível concluir a atualização agora. O painel continua exibindo a última versão disponível.';
  }
  return 'Não foi possível buscar dados novos. Continuamos exibindo a última versão disponível.';
}

async function handleManualDashboardRefresh(route) {
  updateTopbar(route);
  const result = await refreshDashboardNow();
  if (result.status === 'failed') {
    console.error('[dashboard-refresh]', result.error);
    showDashboardToast(runtimeRefreshErrorMessage(result.error), { variant: 'error' });
  } else {
    if (result.dataSource === 'runtime') {
      renderPage();
    }
    if (result.status === 'changed') {
      showDashboardToast('Novos dados carregados.');
    } else if (result.status === 'unchanged') {
      showDashboardToast('Dados já estavam atualizados.');
    }
  }
  updateTopbar(route);
}

function updateTopbar(route) {
  const titleEl = document.getElementById('topbar-title');
  const metaEl = document.getElementById('topbar-meta');
  if (!titleEl || !metaEl || !isLoaded()) return;

  titleEl.textContent = routeMeta(route).topbar ?? 'NPS';
  const user = getAuthSessionUser();
  const authChip =
    dashboardAuthRequired && user?.email
      ? `<button type="button" class="topbar-chip topbar-chip--auth" id="topbar-sign-out" title="Sair">${escapeHtml(user.email)}</button>`
      : '';

  metaEl.innerHTML = renderDashboardDataStatus({ authHtml: authChip });
  bindDashboardDataStatus(metaEl, {
    onRefresh: () => handleManualDashboardRefresh(route),
  });
  metaEl.querySelector('#topbar-sign-out')?.addEventListener('click', async () => {
    await signOutDashboard();
    await ensureDashboardAccess();
  });
}

function renderFiltersBar() {
  const host = document.getElementById('filters-bar');
  if (!host || !isLoaded()) return;
  const route = getRoute();
  if (
    route === 'safras-cobertura' ||
    route === 'historico-nps' ||
    route === 'nps-historico' ||
    route === 'historico-2' ||
    route === 'previsao-nps' ||
    route === 'sistema/documentacao' ||
    route === 'sistema/logs'
  ) {
    host.innerHTML = '';
    host.classList.add('page-filters--hidden');
    host.classList.remove('is-sticky', 'has-scroll-shadow');
    return;
  }
  host.classList.remove('page-filters--hidden');
  const signal = beginFilterBindings();
  const filters = getFilters();
  const cycles = getCycles();
  const responses = getResponses(filters.cycleCode);
  const eps = getEpOptions(responses);
  const stickyOn = stickyFiltersEnabled();
  const topicOptions = showTopicValenceFilters(route) ? getTopicFilterOptions(filters.cycleCode) : [];
  const showTopicValence = topicOptions.length > 0;
  const showNpsPeriod = showNpsPeriodFilter(route) && getNpsAllPeriodsDoc()?.responses?.length;
  const npsPeriodOpts = showNpsPeriod ? buildNpsPeriodSelectOptions() : [];

  host.innerHTML = `
    <div class="filter-shell__fields">
      ${
        showNpsPeriod
          ? `
      <div class="filter-field">
        <label for="filter-nps-period">Período NPS</label>
        <select class="select-input" id="filter-nps-period" aria-label="Filtrar período NPS histórico ou atual">
          ${npsPeriodOpts
            .map(
              (o) =>
                `<option value="${escapeAttr(o.value)}" ${filters.npsPeriod === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`,
            )
            .join('')}
        </select>
      </div>`
          : ''
      }
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
    <div class="filter-sticky-toggle filter-shell__sticky">
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
  host.querySelector('#filter-nps-period')?.addEventListener('change', (e) => setFilter('npsPeriod', e.target.value), opts);
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

function renderPageError(container, route, err) {
  console.error(`[route-render] ${route}`, err);
  container.innerHTML = `<div class="gd-status gd-status--error" role="alert">
    <p><strong>Não foi possível carregar esta página.</strong></p>
    <p class="note-muted">${escapeHtml(err?.message ?? String(err))}</p>
    <p class="note-muted">Veja o Console do navegador para o stack trace.</p>
    <button type="button" class="btn btn--secondary" id="route-retry-btn">Tentar novamente</button>
  </div>`;
  container.querySelector('#route-retry-btn')?.addEventListener('click', () => renderPage());
}

async function renderHistoricoNpsLazy(container, { signal } = {}) {
  container.innerHTML =
    '<div class="gd-status" role="status"><p>Carregando Histórico NPS…</p></div>';
  try {
    const mod = await ensureHistoricoNpsModule();
    if (signal?.aborted) return;
    mod.renderHistoricoNps(container, { signal });
  } catch (err) {
    renderPageError(container, 'historico-nps', err);
  }
}

async function renderHistorico2Lazy(container, { signal } = {}) {
  container.innerHTML =
    '<div class="gd-status" role="status"><p>Carregando NPS Histórico…</p></div>';
  try {
    const mod = await ensureHistorico2Module();
    if (signal?.aborted) return;
    mod.renderHistorico2(container);
  } catch (err) {
    renderPageError(container, 'historico-2', err);
  }
}

async function renderPage() {
  renderFiltersBar();
  const route = getRoute();
  if (route === 'jornada-perfil') {
    const f = getFilters();
    if (f.topic || f.valence) setFilters({ topic: '', valence: '' });
  }
  setNavActive(route);
  document.title = `NPS · ${routeMeta(route).title}`;
  updateTopbar(route);
  closeDrawer();
  closeSafrasDrawer();
  closeHistoricoDrawer();
  closeHistorico2Drawer();
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
  try {
    if (route === 'historico-nps') {
      await renderHistoricoNpsLazy(content, { signal });
      return;
    }
    if (route === 'nps-historico' || route === 'historico-2') {
      await renderHistorico2Lazy(content, { signal });
      return;
    }
    if (route === 'sistema/logs') {
      await renderSistemaLogs(content, { signal });
      return;
    }
    ROUTES[route].render(content, { signal });
  } catch (err) {
    renderPageError(content, route, err);
  }
}

function showState(kind, messageHtml) {
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="gd-status ${kind === 'error' ? 'gd-status--error' : ''}" role="status"><p>${messageHtml}</p></div>`;
}

async function ensureDashboardAccess() {
  const cfg = await loadDashboardAuthConfig();
  dashboardAuthRequired = Boolean(cfg.authRequired);
  const access = await initDashboardAccess();
  const shell = document.querySelector('.app-shell');
  if (access.status === 'authorized') {
    shell?.classList.remove('app-shell--locked');
    return true;
  }
  shell?.classList.add('app-shell--locked');
  const content = document.getElementById('page-content');
  if (content) {
    content.innerHTML = renderAccessGateHtml(access);
    bindAccessGateEvents(content, () => {
      ensureDashboardAccess().then((ok) => {
        if (ok) bootAnalytics();
      });
    });
  }
  if (access.status === 'misconfigured') {
    showState('error', escapeHtml(access.message ?? 'Auth mal configurado.'));
  }
  return false;
}

async function bootAnalytics() {
  showState('loading', escapeHtml('Carregando dados analíticos…'));
  try {
    await bootstrapAnalyticsStaticShell();
    bindMethodologyTrigger(() => {
      const cycleCode = getFilters()?.cycleCode;
      return {
        snapshot: getSnapshot(),
        executiveDiagnosisDoc: getExecutiveDiagnosis(cycleCode),
        cycleSummary: getCycleSummary(cycleCode),
        populationAudit: getPopulationAudit(),
        cycleCode,
        paired: getPairedCycles(cycleCode),
        changeDrivers: getNpsChangeDrivers(),
      };
    });
    const latest = getLatestCycle();
    initDefaultCycle(latest?.cycle_code);
    applyHashQueryToFilters();
    applyStickyFiltersDom();
    renderFiltersBar();
    mountFilterScrollWatch();
    startDashboardRefreshController({
      onResult(detail) {
        if (detail.phase === 'done' && detail.dataSource === 'runtime') {
          renderPage();
        }
        if (detail.phase === 'error') {
          showDashboardToast(runtimeRefreshErrorMessage(detail.error), { variant: 'error' });
        }
        updateTopbar(getRoute());
      },
    });
    subscribeFilters(() => {
      renderFiltersBar();
      updateTopbar(getRoute());
      renderPage();
    });
    window.addEventListener('hashchange', () => {
      applyHashQueryToFilters();
      renderPage();
    });
    renderPage();
    updateTopbar(getRoute());
    void startBackgroundAnalyticsRefresh().then((result) => {
      if (result.status === 'changed' || result.status === 'unchanged') {
        renderPage();
      } else if (result.status === 'failed') {
        console.error('[dashboard-refresh] background failed', result.error);
        showDashboardToast(runtimeRefreshErrorMessage(result.error), { variant: 'error' });
      }
      updateTopbar(getRoute());
    });
  } catch (err) {
    console.error(err);
    let message;
    if (
      err?.code === 'RUNTIME_REQUIRED_FAILED' ||
      err?.code === 'BASE_QV_INVALID_KEY' ||
      err?.code === 'BASE_QV_UNAVAILABLE' ||
      err?.code === 'RUNTIME_HTTP_ERROR'
    ) {
      message = escapeHtml(runtimeRefreshErrorMessage(err));
    } else if (err?.code === 'DATASET_NOT_FOUND' && err.url) {
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

async function boot() {
  const ok = await ensureDashboardAccess();
  if (ok) await bootAnalytics();
}

boot();
