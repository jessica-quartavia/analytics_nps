import {
  getCustomerNpsCohorts,
  getCustomerNpsHistory,
  getSafrasCoberturaSummaries,
  getSafrasCoberturaAudit,
  getHistorico2Doc,
  getPharusAppCustomerMatch,
  getPharusAppMatchAudit,
  getDataState,
  getCycles,
  getCycleSummary,
  getNpsMeasurementsConsolidatedDoc,
  getNpsMeasurementsBaseQvDoc,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import {
  safrasCustomersFromHistorico2,
  enrichSafrasRowsWithNpsHistory,
  enrichSafrasRowsWithPharusAppMatch,
  isSafrasAppUnavailableUsingHistorico2,
} from '../data/historico2-safras-adapter.mjs';
import {
  buildSafrasMeasurementChartSeries,
  hasSafrasMeasurementRecorte,
  officialMeasurementKpiFromSeries,
} from '../data/safras-measurements-view.mjs';
import { isPharusAppMatchAvailable } from '../data/pharus-app-availability.mjs';
import { exportFilteredCsv } from '../utils/export-filtered-csv.mjs';
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
  programOptions,
  statusOptions,
  enrichSafrasNormalizedStatus,
  buildSafraMedicaoPivot,
  enrichCustomersForNpsPeriod,
  getSafraCoverageRows,
  computeNpsByApp,
  enrichCoverageRowsWithApp,
  computeCarteiraAudit,
} from '../data/safras-cobertura-view.mjs';
import { renderDataSourceNotice } from '../ui/data-source-notice.mjs';
import {
  SAFRAS_NPS_PERIOD_OPTIONS,
  friendlyCicloLabel,
  isSafrasPeriodSpecific,
  historyMatchesSafrasNpsPeriod,
} from '../data/safras-nps-period.mjs';
import { formatNpsCycleLabel } from '../utils/nps-cycle-labels.mjs';
import { helpTip } from '../ui/help.js';
import {
  mountMeasurementNpsLineChart,
  mountVerticalBarChart,
} from '../ui/measurement-series-charts.mjs';
import {
  stickyFiltersEnabled,
  setStickyFiltersEnabled,
} from '../utils/sticky-filters.js';

let pageFilters = defaultSafrasFilters();
let chartInstances = [];
let tablePage = 1;
const PAGE_SIZE = 20;

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
      <p class="note-muted safras-page__notice">Os indicadores de NPS por medição utilizam exatamente a mesma série oficial do NPS Histórico. A safra é definida separadamente pela data de entrada do cliente.</p>
    </div>
    <div class="safras-page__actions">
      <button type="button" class="btn btn--secondary btn--sm" data-safras-refresh>Atualizar</button>
      <button type="button" class="btn btn--secondary btn--sm" data-safras-export-csv>↓ Exportar clientes</button>
    </div>
  </header>`;
}

const NPS_METHODOLOGY_TOOLTIP =
  'NPS = (% Promotores − % Detratores) × 100. Promotores: 9–10; Neutros: 7–8; Detratores: 0–6.';

function resolveOfficialNpsBounds(cycleDef) {
  if (cycleDef?.type === 'source_cycle' && (cycleDef.starts_at || cycleDef.ends_at)) {
    return { starts_at: cycleDef.starts_at ?? null, ends_at: cycleDef.ends_at ?? null };
  }
  return null;
}

function resolveSafrasNpsContext() {
  const cycleCode = getFilters()?.cycleCode ?? getCycles()?.[0]?.cycle_code;
  const cycleDef = (getCycles() ?? []).find((c) => c.cycle_code === cycleCode) ?? null;
  const rawResponses = getDataState()?.responses ?? [];
  return { cycleDef, officialBounds: resolveOfficialNpsBounds(cycleDef), rawResponses };
}

const SAFRAS_TIPS = {
  npsPeriod:
    'Define qual medição de NPS será usada para calcular participação, nota e NPS dos clientes.',
  safra:
    'Safra representa o trimestre de entrada do cliente, definido pela data de pagamento do programa.',
  appUnavailable:
    'Dados do App Pharus indisponíveis. Configure PHARUS_SUPABASE_* e rode npm run generate:pharus-app-match.',
  appTooltip:
    'Cliente encontrado na base cadastral do App Pharus por CPF, e-mail ou telefone.',
  carteira:
    'Ativos considera apenas clientes que ainda fazem parte da carteira. Cancelamentos efetivos e clientes congelados ficam fora.',
};

function filterLabelWithTip(forId, text, tip) {
  return `<label for="${forId}">${helpTip(text, tip)}</label>`;
}

function renderFilters(customers) {
  const safras = safraOptions(customers).sort(sortSafraLabel);
  const eps = epOptions(customers);
  const programas = programOptions(customers);
  const statuses = statusOptions(customers);
  const stickyOn = stickyFiltersEnabled();
  return `<div class="card filters-panel safras-filters-card ${stickyOn ? 'safras-filters-card--sticky' : ''}" id="safras-page-filters">
    <div class="safras-filters-card__head">
      <span class="safras-filters-card__title">Filtros</span>
      <div class="filter-sticky-toggle safras-filters-card__sticky">
        <span class="filter-sticky-label">Fixar filtros</span>
        <label class="switch" aria-label="Fixar filtros durante a rolagem">
          <input type="checkbox" id="safras-sticky-switch" data-safras-sticky ${stickyOn ? 'checked' : ''} />
          <span class="switch__track"></span>
          <span class="switch__thumb"></span>
        </label>
      </div>
    </div>
    <div class="filters-panel__grid safras-filters-grid" data-safras-filters>
      <div class="filter-field">
        ${filterLabelWithTip('sf-carteira', 'Carteira', SAFRAS_TIPS.carteira)}
        <select id="sf-carteira" class="select-input" data-f="carteira">
          <option value="active" ${pageFilters.carteira !== 'all' ? 'selected' : ''}>Ativos</option>
          <option value="all" ${pageFilters.carteira === 'all' ? 'selected' : ''}>Todos</option>
        </select>
      </div>
      <div class="filter-field">
        ${filterLabelWithTip('sf-nps-period', 'Período NPS', SAFRAS_TIPS.npsPeriod)}
        <select id="sf-nps-period" class="select-input" data-f="npsPeriod">
          ${SAFRAS_NPS_PERIOD_OPTIONS.map(
            (o) =>
              `<option value="${escapeAttr(o.value)}" ${pageFilters.npsPeriod === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`,
          ).join('')}
        </select>
      </div>
      <div class="filter-field">
        ${filterLabelWithTip('sf-safra', 'Safra', SAFRAS_TIPS.safra)}
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
        <label for="sf-programa">Programa</label>
        <select id="sf-programa" class="select-input" data-f="programa">
          <option value="">Todos</option>
          ${programas
            .map(
              (p) =>
                `<option value="${escapeAttr(p)}" ${pageFilters.programa === p ? 'selected' : ''}>${escapeHtml(p)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="sf-status">Status</label>
        <select id="sf-status" class="select-input" data-f="status">
          <option value="">Todos</option>
          ${statuses
            .map(
              (s) =>
                `<option value="${escapeAttr(s)}" ${pageFilters.status === s ? 'selected' : ''}>${escapeHtml(s)}</option>`,
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
        ${filterLabelWithTip(
          'sf-app',
          'App',
          isAppSourceUnavailable(getSafrasCoberturaAudit())
            ? SAFRAS_TIPS.appUnavailable
            : SAFRAS_TIPS.appTooltip,
        )}
        <select id="sf-app" class="select-input" data-f="app">
          <option value="all">Todos</option>
          <option value="yes" ${pageFilters.app === 'yes' ? 'selected' : ''}>Com App</option>
          <option value="no" ${pageFilters.app === 'no' ? 'selected' : ''}>Sem App</option>
          <option value="unknown" ${pageFilters.app === 'unknown' ? 'selected' : ''}>Match não identificado</option>
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

function renderKpiGrid(kpis, audit, npsPeriod, appUnavailable, measurementKpiOfficial, measurementRecorte) {
  const appUnavail = appUnavailable || kpis.appDataMissing || isAppSourceUnavailable(audit);
  const periodSpecific = isSafrasPeriodSpecific(npsPeriod);
  const appValue = appUnavail ? '—' : String(kpis.appYes);
  const appSub = appUnavail
    ? '<span class="safras-kpi__sub safras-kpi__sub--muted" title="Dados do App Pharus indisponíveis neste snapshot.">Dados do App Pharus indisponíveis neste snapshot.</span>'
    : `<span class="safras-kpi__sub">${formatPct(kpis.pctApp, 1)} da base</span>`;
  const appAnsSub = appUnavail
    ? '<span class="safras-kpi__sub safras-kpi__sub--muted">—</span>'
    : `<span class="safras-kpi__sub">${kpis.appYes ? formatPct(kpis.pctAppAnswered, 1) : 'N indisponível'} dos com App</span>`;

  const answeredTip = periodSpecific
    ? 'Clientes que responderam a medição selecionada.'
    : 'Clientes que responderam pelo menos uma pesquisa NPS em algum período disponível.';
  const neverTip = periodSpecific
    ? 'Clientes que não responderam a medição selecionada.'
    : 'Clientes sem nenhuma resposta NPS conhecida.';

  const items = [
    {
      label: 'Clientes analisados',
      tip: 'Quantidade de clientes elegíveis no recorte atual após aplicação dos filtros.',
      value: String(kpis.clients),
      sub: 'Universo PHARUS no recorte',
    },
    {
      label: periodSpecific ? 'Responderam no período' : 'Já responderam NPS',
      tip: answeredTip,
      value: String(kpis.answered),
      sub: `${formatPct(kpis.pctAnswered, 1)} da base`,
    },
    {
      label: periodSpecific ? 'Não responderam no período' : 'Nunca responderam',
      tip: neverTip,
      value: String(kpis.never),
      sub: `${formatPct(kpis.pctNever, 1)} da base`,
    },
    {
      label: 'Com App',
      tip: appUnavail ? SAFRAS_TIPS.appUnavailable : SAFRAS_TIPS.appTooltip,
      value: appValue,
      sub: appSub,
      rawSub: true,
    },
    {
      label: 'Sem App',
      tip: appUnavail
        ? SAFRAS_TIPS.appUnavailable
        : 'Matching executado e nenhuma correspondência na base cadastral do App.',
      value: appUnavail ? '—' : String(kpis.appNo),
      sub: appUnavail
        ? '<span class="safras-kpi__sub safras-kpi__sub--muted">—</span>'
        : `<span class="safras-kpi__sub">${formatPct(kpis.pctNoApp, 1)} da base</span>`,
      rawSub: true,
    },
    {
      label: 'App + responderam',
      tip: 'Clientes com App que também responderam no recorte NPS selecionado.',
      value: appUnavail ? '—' : String(kpis.appAndAnswered),
      sub: appAnsSub,
      rawSub: true,
    },
    {
      label: measurementKpiOfficial
        ? `NPS (${measurementKpiOfficial.measurement})`
        : periodSpecific
          ? 'NPS do período'
          : 'NPS (última nota)',
      tip: NPS_METHODOLOGY_TOOLTIP,
      value:
        measurementKpiOfficial?.nps != null
          ? formatNps(measurementKpiOfficial.nps)
          : kpis.nps != null
            ? formatNps(kpis.nps)
            : '—',
      sub: measurementKpiOfficial
        ? `Série oficial · n=${measurementKpiOfficial.responses ?? '—'} · ${measurementKpiOfficial.analytical_cycle ?? 'ciclo analítico'}`
        : measurementRecorte
          ? 'Recorte filtrado'
          : 'Agregado no recorte de clientes',
    },
    {
      label: 'Mediana dias → 1º NPS',
      tip: 'Quantidade de dias entre a data de entrada por pagamento e a primeira resposta NPS do cliente.',
      value: kpis.medianDays != null ? String(kpis.medianDays) : '—',
      sub: 'Entre entrada e 1ª resposta',
    },
  ];

  const conflictNote =
    !appUnavail && (kpis.appConflicts ?? 0) > 0
      ? `<p class="note-muted safras-kpi-grid__note">${kpis.appConflicts} cliente(s) com conflito de match App (CPF/e-mail apontam cadastros distintos).</p>`
      : '';
  return `<div class="safras-kpi-grid">${items
    .map(
      (it) => `<article class="safras-kpi">
        <div class="safras-kpi__label">${helpTip(it.label, it.tip)}</div>
        <div class="safras-kpi__value">${it.rawSub ? it.value : escapeHtml(it.value)}</div>
        <div class="safras-kpi__sub">${it.rawSub ? it.sub : escapeHtml(it.sub)}</div>
      </article>`,
    )
    .join('')}${conflictNote}</div>`;
}

function renderAppNpsSection(appNps, appUnavailable, npsPeriod) {
  if (appUnavailable) return '';
  const periodSpecific = isSafrasPeriodSpecific(npsPeriod);
  const subtitle = periodSpecific
    ? 'Comparativo descritivo no período NPS selecionado (não causal).'
    : 'Comparativo descritivo com última nota conhecida (não causal).';
  const wa = appNps.withApp;
  const wo = appNps.withoutApp;
  const showNps = wa.n >= 5 || wo.n >= 5;
  return `<div class="safras-section-card">
    <div class="safras-section-card__head">
      <h2 class="safras-section-card__title">App × NPS</h2>
      <p class="safras-section-card__lead">${escapeHtml(subtitle)}</p>
    </div>
    <div class="safras-app-nps-grid">
      <article class="safras-kpi">
        <div class="safras-kpi__label">${helpTip('NPS — com App', SAFRAS_TIPS.appTooltip)}</div>
        <div class="safras-kpi__value">${showNps && wa.n >= 5 && wa.nps != null ? formatNps(wa.nps) : '—'}</div>
        <div class="safras-kpi__sub">N respostas: ${wa.n}</div>
      </article>
      <article class="safras-kpi">
        <div class="safras-kpi__label">${helpTip('NPS — sem App', 'Clientes sem match na base cadastral do App.')}</div>
        <div class="safras-kpi__value">${showNps && wo.n >= 5 && wo.nps != null ? formatNps(wo.nps) : '—'}</div>
        <div class="safras-kpi__sub">N respostas: ${wo.n}</div>
      </article>
      <article class="safras-kpi">
        <div class="safras-kpi__label">Taxa resposta — com App</div>
        <div class="safras-kpi__value">${formatPct(wa.pctAnswered, 1)}</div>
        <div class="safras-kpi__sub">${wa.answered} / ${wa.n} clientes</div>
      </article>
      <article class="safras-kpi">
        <div class="safras-kpi__label">Taxa resposta — sem App</div>
        <div class="safras-kpi__value">${formatPct(wo.pctAnswered, 1)}</div>
        <div class="safras-kpi__sub">${wo.answered} / ${wo.n} clientes</div>
      </article>
    </div>
  </div>`;
}

function renderCoberturaTable(coverageRows, npsPeriod, appUnavailable) {
  const pctTip = isSafrasPeriodSpecific(npsPeriod)
    ? '% de clientes da safra que responderam a medição selecionada.'
    : '% de clientes da safra que responderam a medição selecionada. Em Todos, representa quem já respondeu alguma vez.';
  const rows = [...coverageRows].sort((a, b) => sortSafraLabel(a.safra_trimestre, b.safra_trimestre));

  if (!rows.length) {
    return '<div class="safras-empty"><p>Nenhuma safra no recorte.</p></div>';
  }

  const body = rows
    .map((s) => {
      const pct = s.pct_que_ja_responderam ?? 0;
      const pctBar = `<div class="safras-pct-bar"><span>${formatPct(pct, 1)}</span>
        <div class="safras-pct-bar__track" aria-hidden="true"><span class="safras-pct-bar__fill" style="width:${Math.min(100, pct)}%"></span></div></div>`;
      const appPct =
        !appUnavailable && s.pct_with_app != null
          ? formatPct(s.pct_with_app, 1)
          : '—';
      return `<tr>
        <th scope="row">${escapeHtml(s.safra_trimestre)}</th>
        <td class="num">${s.clientes_total}</td>
        <td class="num">${s.clientes_que_responderam}</td>
        <td class="num">${pctBar}</td>
        <td class="num" title="${escapeAttr(SAFRAS_TIPS.appTooltip)}">${appPct}</td>
        <td class="num">${s.nps_atual != null ? formatNps(s.nps_atual) : '—'}</td>
        <td class="num">${formatNotaMedia(s.nota_media)}</td>
      </tr>`;
    })
    .join('');

  return `<div class="table-shell">
    <table class="data-table safras-data-table">
      <colgroup>
        <col style="width:16%" /><col style="width:11%" /><col style="width:12%" />
        <col style="width:14%" /><col style="width:11%" /><col style="width:12%" /><col style="width:12%" />
      </colgroup>
      <thead><tr>
        <th scope="col">Safra</th>
        <th scope="col" class="num">Clientes</th>
        <th scope="col" class="num">Responderam</th>
        <th scope="col" class="num">${helpTip('% responderam', pctTip)}</th>
        <th scope="col" class="num">${helpTip('% com App', SAFRAS_TIPS.appTooltip)}</th>
        <th scope="col" class="num">${helpTip('NPS', NPS_METHODOLOGY_TOOLTIP)}</th>
        <th scope="col" class="num">${helpTip('Nota média', 'Média das notas NPS dos clientes que responderam dentro do recorte selecionado.')}</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderMatrix(history, customers, npsPeriod) {
  const pivot = buildSafraMedicaoPivot(history, customers, 'nps', npsPeriod);
  const { safras, ciclos, cellAgg } = pivot;
  if (!ciclos.length) {
    return '<p class="placeholder-note">Sem histórico para matriz.</p>';
  }

  const safraList = [...safras].sort(sortSafraLabel);
  const ni = 'Não informado';
  if (!safraList.includes(ni) && ciclos.some((c) => (cellAgg?.[`${ni}||${c}`]?.n ?? 0) > 0)) {
    safraList.push(ni);
  }

  let body = '';
  for (const s of safraList) {
    body += `<tr><th scope="row" class="safras-matrix-sticky-col">${escapeHtml(s)}</th>`;
    for (const c of ciclos) {
      const agg = cellAgg?.[`${s}||${c}`] ?? { nps: null, n: 0, promoters: 0, neutrals: 0, detractors: 0 };
      const val = agg.nps;
      const n = agg.n ?? 0;
      const heat = npsHeatClass(val);
      const display = val == null ? '—' : formatNps(val);
      const small = n > 0 && n < 5 ? ' safras-matrix-cell--small-n' : '';
      const title = `Safra ${s} · Medição ${formatNpsCycleLabel(c)} · NPS ${display} · n=${n} · Promotores ${agg.promoters ?? 0} · Neutros ${agg.neutrals ?? 0} · Detratores ${agg.detractors ?? 0}`;
      const cellBody =
        val == null
          ? '—'
          : `<span class="safras-matrix-nps">${display}</span><span class="safras-matrix-n">n=${n}</span>${n > 0 && n < 5 ? '<span class="safras-matrix-warn">Amostra pequena</span>' : ''}`;
      body += `<td class="safras-matrix-cell ${heat}${small}" title="${escapeAttr(title)}">${cellBody}</td>`;
    }
    body += '</tr>';
  }

  return `<div class="table-shell safras-matrix-shell">
    <table class="data-table safras-data-table safras-matrix-table">
      <thead><tr>
        <th class="safras-matrix-sticky-col" scope="col">Safra ↓ / Ciclo →</th>
        ${ciclos.map((c) => `<th scope="col">${escapeHtml(formatNpsCycleLabel(c))}</th>`).join('')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderExplorerSection(rows, appUnavailable, npsPeriod) {
  const periodSpecific = isSafrasPeriodSpecific(npsPeriod);
  const filtered = rows;
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
      const qtd = periodSpecific ? (r.period_response_count ?? 0) : (r.nps_response_count ?? 0);
      const avg =
        qtd >= 2 && r.avg_nps_score != null ? formatNotaMedia(r.avg_nps_score) : '—';
      const dias =
        r.data_entrada && r.days_entry_to_first_nps_valid != null
          ? r.days_entry_to_first_nps_valid
          : '—';
      return `<tr class="safras-explorer-table__row--clickable" data-client-id="${escapeAttr(r.client_id)}" tabindex="0" role="button" aria-label="Ver detalhes de ${escapeAttr(clientLabel)}">
        <td class="col-client safras-col-client">${escapeHtml(r.client_name ?? '—')}</td>
        <td>${escapeHtml(r.safra_trimestre ?? '—')}</td>
        <td class="col-date">${escapeHtml(entrada)}</td>
        <td>${escapeHtml(r.programa ?? '—')}</td>
        <td>${escapeHtml(r.ep ?? '—')}</td>
        <td>${escapeHtml(r.normalized_status ?? '—')}</td>
        <td>${badgeApp(r, appUnavailable)}</td>
        <td>${badgeAnswered(periodSpecific ? r.answered_selected_period : r.ever_answered_nps)}</td>
        <td class="num">${qtd}</td>
        <td class="num">${periodSpecific ? (r.period_nps_score ?? '—') : (r.last_nps_score ?? '—')}</td>
        <td>${escapeHtml(periodSpecific ? (r.period_nps_category ?? '—') : (r.last_nps_category ?? '—'))}</td>
        <td class="num">${avg}</td>
        <td>${escapeHtml(periodSpecific ? (friendlyCicloLabel(r.period_last_ciclo) ?? '—') : (r.last_nps_cycle ?? '—'))}</td>
        <td class="num">${dias}</td>
      </tr>`;
    })
    .join('');

  return `<div class="safras-section-card">
    <div class="safras-section-card__head">
      <h2 class="safras-section-card__title">Clientes</h2>
      <p class="safras-section-card__lead">Histórico de participação no NPS por cliente.</p>
    </div>
    ${renderExplorerToolbar(total)}
    <div class="table-shell safras-explorer-shell">
      <table class="data-table safras-data-table safras-explorer-table">
        <thead class="safras-explorer-table__head"><tr>
          <th>Cliente</th><th>Safra</th><th>Entrada</th><th>Programa</th><th>EP</th><th>Status</th><th>App</th><th>Respondeu NPS?</th>
          <th class="num">Qtd respostas</th><th class="num">Última nota</th><th>Categoria</th><th class="num">Média</th>
          <th>Último ciclo</th><th class="num">${helpTip('Dias 1º NPS', 'Dias entre data de entrada (BASE0) e a primeira resposta NPS válida (BASE QV).')}</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    ${renderTableFooter(start, total, pages)}
  </div>`;
}

function renderExplorerToolbar(total) {
  return `<div class="safras-explorer-toolbar">
    <div class="filter-field safras-explorer-toolbar__search">
      <label for="sf-search">Buscar cliente</label>
      <input id="sf-search" type="search" class="text-input" placeholder="Buscar por nome, e-mail ou ID" value="${escapeAttr(pageFilters.search ?? '')}" data-safras-search />
    </div>
    <button type="button" class="btn btn--secondary btn--sm" data-safras-export-table>↓ Exportar clientes</button>
    <p class="note-muted" style="margin:0">${total} resultado(s)</p>
  </div>`;
}

function renderTableFooter(start, total, pages) {
  const from = total ? start + 1 : 0;
  const to = Math.min(start + PAGE_SIZE, total);
  return `<div class="safras-table-footer">
    <span class="safras-table-footer__range">Mostrando ${from}–${to} de ${total}</span>
    <div class="safras-pager">
      <button type="button" class="btn btn--secondary btn--sm safras-pager__btn" data-page-prev ${tablePage <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="safras-pager__meta">Página ${tablePage} de ${pages}</span>
      <button type="button" class="btn btn--secondary btn--sm safras-pager__btn" data-page-next ${tablePage >= pages ? 'disabled' : ''}>Próxima →</button>
    </div>
  </div>`;
}

function renderQuality(audit, carteiraAudit) {
  if (!audit) return '';
  const ca = carteiraAudit ?? {};
  return `<div class="safras-section-card safras-quality-card">
    <details>
      <summary>Qualidade & cobertura</summary>
      <div class="safras-quality-grid">
        <div class="safras-quality-item"><strong>Carteira (QA)</strong><br>
          Todos: ${ca.total_all ?? '—'} · Ativos: ${ca.total_active ?? '—'} · Excluídos: ${ca.total_excluded ?? '—'}<br>
          <span class="note-muted">Cancelado ${ca.cancelado ?? 0} · Congelado ${ca.congelado ?? 0} · Outros ${ca.outros ?? 0}</span>
        </div>
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
  const historico2 = getHistorico2Doc();
  const useHistorico2 = Boolean(historico2?.clients?.length);
  let customersAll = useHistorico2
    ? safrasCustomersFromHistorico2(historico2)
    : getCustomerNpsCohorts();
  const historyAll = getCustomerNpsHistory();
  const summaries = getSafrasCoberturaSummaries();
  const audit = getSafrasCoberturaAudit();

  if (!customersAll?.length) {
    root.innerHTML = `<p class="placeholder-note">Execute <code>npm run generate:safras-cobertura</code> e recarregue os dados.</p>`;
    return;
  }

  const pharusMatch = getPharusAppCustomerMatch();
  const pharusAudit = getPharusAppMatchAudit();
  customersAll = enrichSafrasRowsWithPharusAppMatch(customersAll, pharusMatch);
  customersAll = enrichSafrasRowsWithNpsHistory(customersAll, historyAll);
  customersAll = enrichSafrasNormalizedStatus(customersAll);
  const enrichedAll = enrichCustomersForNpsPeriod(
    customersAll,
    historyAll,
    pageFilters.npsPeriod,
  );
  const customers = applySafrasFilters(enrichedAll, pageFilters);
  const clientIds = new Set(customers.map((c) => c.client_id));
  const history = historyAll.filter(
    (h) => clientIds.has(h.client_id) && historyMatchesSafrasNpsPeriod(h, pageFilters.npsPeriod),
  );
  const { cycleDef, officialBounds, rawResponses } = resolveSafrasNpsContext();
  const cycleSummaryTemplate = cycleDef?.cycle_code ? getCycleSummary(cycleDef.cycle_code) : null;
  const kpiOfficialBounds =
    pageFilters.npsPeriod === 'current' ? officialBounds : null;
  const appUnavailable =
    !isPharusAppMatchAvailable(pharusMatch, pharusAudit) &&
    (isSafrasAppUnavailableUsingHistorico2(historico2, audit, pharusMatch, pharusAudit) ||
      isAppSourceUnavailable(audit));
  const kpis = computeSafrasKpis(customers, {
    npsPeriod: pageFilters.npsPeriod,
    appUnavailable,
    history,
    officialBounds: kpiOfficialBounds,
  });

  const consolidatedDoc = getNpsMeasurementsConsolidatedDoc();
  const baseQvDoc = getNpsMeasurementsBaseQvDoc();
  const measurementRecorte = hasSafrasMeasurementRecorte(pageFilters);
  const measurementSeries = useHistorico2
    ? buildSafrasMeasurementChartSeries({
        consolidatedDoc,
        baseQvDoc,
        responses: rawResponses,
        cycles: getCycles(),
        historico2Doc: historico2,
        filteredSafrasCustomers: customers,
        pageFilters,
        cycleSummaryTemplate,
      })
    : [];
  const measurementKpiOfficial =
    !measurementRecorte && measurementSeries.length
      ? officialMeasurementKpiFromSeries(measurementSeries, consolidatedDoc)
      : null;

  const coverageRows = enrichCoverageRowsWithApp(
    getSafraCoverageRows(
      summaries,
      customers,
      history,
      pageFilters.npsPeriod,
      pageFilters.safra,
      kpiOfficialBounds,
    ),
    customers,
  );
  const appNps = computeNpsByApp(customers, {
    npsPeriod: pageFilters.npsPeriod,
    history,
    officialBounds: kpiOfficialBounds,
  });
  const carteiraAudit = computeCarteiraAudit(customersAll);

  root.innerHTML = `<div class="safras-page">
    ${renderPageHeader()}
    ${renderDataSourceNotice('safras-cobertura', { appPharusPending: appUnavailable })}
    ${renderFilters(customersAll)}
    ${renderKpiGrid(kpis, audit, pageFilters.npsPeriod, appUnavailable, measurementKpiOfficial, measurementRecorte)}
    ${renderAppNpsSection(appNps, appUnavailable, pageFilters.npsPeriod)}

    <div class="safras-section-card">
      <div class="safras-section-card__head">
        <h2 class="safras-section-card__title">Cobertura por safra</h2>
        <p class="safras-section-card__lead">Participação no NPS e resultado por coorte de entrada.</p>
      </div>
      ${renderCoberturaTable(coverageRows, pageFilters.npsPeriod, appUnavailable)}
    </div>

    <div class="safras-charts-row">
      <div class="chart-card">
        <h3 class="safras-section-card__title">% que já respondeu por safra</h3>
        <div class="chart-wrap safras-chart-wrap"><canvas id="chart-safra-coverage"></canvas></div>
      </div>
      <div class="chart-card">
        <h3 class="safras-section-card__title">NPS por medição</h3>
        <p class="note-muted">${measurementRecorte ? 'Recorte filtrado — subconjunto de clientes do recorte atual.' : 'Mesma série oficial utilizada no NPS Histórico.'}</p>
        <div class="chart-wrap safras-chart-wrap"><canvas id="chart-measurement-nps"></canvas></div>
      </div>
    </div>

    <div class="safras-section-card">
      <div class="safras-section-card__head-row">
        <div>
          <h2 class="safras-section-card__title">${helpTip('Matriz safra × medição', 'Cada linha representa a safra de entrada do cliente e cada coluna uma medição NPS. O valor mostra o NPS dos clientes daquela safra na medição.')}</h2>
          <p class="safras-section-card__lead">NPS dos clientes de cada safra em cada ciclo.</p>
        </div>
      </div>
      ${renderMatrix(history, customers, pageFilters.npsPeriod)}
    </div>

    ${renderExplorerSection(customers, appUnavailable, pageFilters.npsPeriod)}
    ${renderQuality(audit, carteiraAudit)}
  </div>`;

  bindSafrasCobertura(root, customersAll, historyAll, customers, appUnavailable);
  bindCharts(coverageRows, measurementSeries);
}

function bindCharts(coverageRows, measurementSeries) {
  const ChartRef = typeof window !== 'undefined' ? window.Chart : null;
  if (!ChartRef) return;

  const rows = (coverageRows ?? [])
    .filter((s) => s.safra_trimestre !== 'Não informado')
    .sort((a, b) => sortSafraLabel(a.safra_trimestre, b.safra_trimestre));
  const labels = rows.map((r) => r.safra_trimestre);
  const cov = document.getElementById('chart-safra-coverage');
  const meas = document.getElementById('chart-measurement-nps');
  const series = measurementSeries ?? [];

  mountVerticalBarChart({
    ChartRef,
    canvas: cov,
    labels,
    values: rows.map((r) => r.pct_que_ja_responderam),
    chartInstances,
    formatKind: 'pct',
    yMax: 100,
    yTickFormat: (v) => `${v}%`,
    barColor: '#e85d3a',
  });

  mountMeasurementNpsLineChart({
    ChartRef,
    canvas: meas,
    series,
    chartInstances,
  });
}

function exportExplorerCsv(customers, appUnavailable) {
  const periodSpecific = isSafrasPeriodSpecific(pageFilters.npsPeriod);
  exportFilteredCsv({
    filename: 'safras_cobertura_clientes.csv',
    columns: [
      { header: 'Cliente', key: 'client_name' },
      { header: 'Client ID', key: 'client_id' },
      { header: 'Safra', key: 'safra_trimestre' },
      { header: 'Data entrada', value: (r) => r.data_entrada ?? '—' },
      { header: 'Programa', key: 'programa' },
      { header: 'EP', key: 'ep' },
      { header: 'Status', value: (r) => r.normalized_status ?? r.status_cliente ?? '—' },
      {
        header: 'Última nota',
        value: (r) => (periodSpecific ? r.period_nps_score : r.last_nps_score) ?? '—',
      },
      {
        header: 'Categoria',
        value: (r) => (periodSpecific ? r.period_nps_category : r.last_nps_category) ?? '—',
      },
      {
        header: 'Qtd respostas',
        value: (r) =>
          periodSpecific ? (r.period_response_count ?? 0) : (r.nps_response_count ?? 0),
      },
      {
        header: 'Último ciclo',
        value: (r) => (periodSpecific ? r.period_last_ciclo : r.last_nps_cycle) ?? '—',
      },
      {
        header: 'App',
        value: (r) =>
          appUnavailable
            ? '—'
            : r.app_match === true || r.has_app_access === true
              ? 'Sim'
              : r.has_app_access === false
                ? 'Não'
                : '—',
      },
    ],
    rows: customers,
  });
}

export function closeSafrasDrawer() {
  closeCohortClientDrawer();
}

function bindSafrasCobertura(root, customersAll, historyAll, customersFiltered, appUnavailable) {

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
      tablePage = 1;
      renderSafrasCobertura(root);
    });
  });

  root.querySelector('[data-safras-search]')?.addEventListener('input', (ev) => {
    pageFilters = { ...pageFilters, search: ev.target.value };
    tablePage = 1;
    renderSafrasCobertura(root);
  });

  root.querySelector('[data-safras-refresh]')?.addEventListener('click', () => {
    window.location.reload();
  });

  const doExport = () => exportExplorerCsv(customersFiltered, appUnavailable);
  root.querySelector('[data-safras-export-csv]')?.addEventListener('click', doExport);
  root.querySelector('[data-safras-export-table]')?.addEventListener('click', doExport);

  root.querySelector('[data-safras-sticky]')?.addEventListener('change', (ev) => {
    setStickyFiltersEnabled(ev.target.checked);
    renderSafrasCobertura(root);
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
