import {
  getCycleSummary,
  getPreviousCycle,
  getPairedCycles,
  getCycles,
  getCsatSummary,
  hasCsatArtifacts,
  getExecutiveDiagnosis,
  hasExecutiveDiagnosis,
  getGlobalFilterContext,
  getExecutiveOfficialSummary,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import { renderFilterRecorteBanner } from '../filters/filter-context.mjs';
import {
  formatNps,
  formatPct,
  formatDeltaPts,
  formatDeltaPp,
  formatDate,
  formatDateTime,
  formatCsatAverageWithScale,
  formatNpsMeanScore,
} from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { helpTip, TIPS } from '../ui/help.js';
import {
  buildExecutiveModalModel,
} from '../data/executive-highlights.mjs';
import { EXECUTIVE_KPI_LABELS, POPULATION_TIPS } from '../data/population-transparency.mjs';
import { bindRespondentsDrawer, closeRespondentsDrawer } from '../ui/respondents-drawer.js';
import { renderDataSourceNotice } from '../ui/data-source-notice.mjs';
import { renderExecutivoCycleSnapshot } from '../ui/executivo-cycle-snapshot.mjs';

let charts = [];

function destroyCharts() {
  for (const c of charts) c.destroy();
  charts = [];
}

/** Opções comuns Chart.js — labels e tooltips dentro da viewport. */
function chartPresentationOptions(extra = {}) {
  const { plugins: extraPlugins = {}, scales: extraScales = {}, ...rest } = extra;
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 8, right: 12, bottom: 8, left: 4 } },
    plugins: {
      tooltip: {
        position: 'nearest',
        caretPadding: 10,
        padding: 10,
      },
      ...extraPlugins,
    },
    scales: {
      x: {
        ticks: { maxRotation: 45, minRotation: 0, autoSkip: true },
        ...extraScales.x,
      },
      ...extraScales,
    },
    ...rest,
  };
}

function zoneColor(score) {
  if (score <= 6) return getComputedStyle(document.documentElement).getPropertyValue('--color-detractor').trim();
  if (score <= 8) return getComputedStyle(document.documentElement).getPropertyValue('--color-passive').trim();
  return getComputedStyle(document.documentElement).getPropertyValue('--color-promoter').trim();
}

function renderQualityNotes(current, previous) {
  const items = [];
  if (previous?.historical_gap) {
    items.push(
      `Jun–Jul: gap histórico de ${previous.historical_gap} respostas vs referência externa (reconstrução parcial).`,
    );
  }
  if (previous?.reconstruction_status === 'partial') {
    items.push('Ciclo anterior reconstruído — interpretar com cautela.');
  }
  if (current?.response_rate_quality && current.response_rate_quality !== 'complete') {
    items.push(`Set: taxa de resposta ${current.response_rate_quality} (coleta em andamento ou base incompleta).`);
  }
  if (!items.length) return '';
  return `<div class="quality-box"><strong>Qualidade da leitura</strong><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`;
}

function renderHero() {
  return `
    <header class="page-header page-header--compact">
      <div>
        <p class="eyebrow">Visão executiva</p>
        <h1 class="hero__title">NPS — Diagnóstico de Gestão</h1>
        <p class="page-header__lead">KPIs, leitura rápida e gráficos do ciclo selecionado.</p>
      </div>
    </header>`;
}

function deltaHint(current, previous) {
  if (current == null || previous == null) return '';
  const d = current - previous;
  if (d < 0) return '↓ queda no ciclo';
  if (d > 0) return '↑ avanço no ciclo';
  return '→ estável';
}

function renderKpiRow(currentSummary, previousSummary, currentCycle, prevCycle) {
  const nps = currentSummary?.nps;
  const prevNps = previousSummary?.nps;
  const d = nps != null && prevNps != null ? nps - prevNps : null;
  const deltaClass =
    d == null ? '' : d < 0 ? 'metric-hero metric-delta--down' : d > 0 ? 'metric-hero metric-delta--up' : 'metric-hero';
  return `
    <div class="metric-hero-grid">
      <article class="metric-hero metric-hero--primary">
        <div class="metric-hero__label">${helpTip('NPS atual', TIPS.npsAtual)}</div>
        <div class="metric-hero__value">${escapeHtml(formatNps(nps))}</div>
        <div class="metric-hero__note" title="O BASE QV pode exibir o NPS arredondado como inteiro.">${escapeHtml(currentCycle?.cycle_name ?? '—')}</div>
      </article>
      <article class="metric-hero">
        <div class="metric-hero__label">${helpTip('Nota média', 'Média das notas NPS válidas no recorte selecionado.')}</div>
        <div class="metric-hero__value">${escapeHtml(formatNpsMeanScore(currentSummary?.average_score))}</div>
        <div class="metric-hero__note">Escala 0–10</div>
      </article>
      <article class="metric-hero">
        <div class="metric-hero__label">${helpTip('NPS anterior', TIPS.npsAnterior)}</div>
        <div class="metric-hero__value">${escapeHtml(formatNps(prevNps))}</div>
        <div class="metric-hero__note">${escapeHtml(prevCycle?.cycle_name ?? '—')}</div>
      </article>
      <article class="${deltaClass}">
        <div class="metric-hero__label">${helpTip('Variação', TIPS.variacao)}</div>
        <div class="metric-hero__value">${escapeHtml(formatDeltaPts(nps, prevNps))}</div>
        <div class="metric-delta__hint">${escapeHtml(deltaHint(nps, prevNps))}</div>
      </article>
    </div>`;
}

function renderSampleRow(currentSummary, officialSummary, recorteActive) {
  const valid = currentSummary?.valid_responses ?? 0;
  const eligible = officialSummary?.eligible_clients ?? 0;
  const rr =
    !recorteActive && officialSummary?.response_rate != null
      ? formatPct(officialSummary.response_rate * 100, 1)
      : '—';
  const rateTip = recorteActive
    ? 'Taxa de resposta oficial do ciclo — não se aplica ao recorte filtrado.'
    : POPULATION_TIPS.responseRate(valid, eligible);
  return `
    <div class="metric-context-grid">
      <div class="metric-context metric-context--with-action">
        <div class="metric-context__label">${helpTip(EXECUTIVE_KPI_LABELS.validResponses, recorteActive ? 'Respostas no recorte atual.' : TIPS.validResponses)}</div>
        <div class="metric-context__value">${escapeHtml(String(currentSummary?.valid_responses ?? '—'))}</div>
        <button type="button" class="link-button" id="btn-ver-respondentes">Ver respondentes</button>
      </div>
      <div class="metric-context">
        <div class="metric-context__label">${helpTip('Última resposta NPS', 'Data e hora da resposta NPS válida mais recente registrada no ciclo selecionado (respeita filtros do recorte).')}</div>
        <div class="metric-context__value">${escapeHtml(formatDateTime(currentSummary?.latest_nps_response_at))}</div>
      </div>
      <div class="metric-context">
        <div class="metric-context__label">${helpTip(EXECUTIVE_KPI_LABELS.clientsWithSend, TIPS.clientsWithSend)}</div>
        <div class="metric-context__value">${recorteActive ? '—' : escapeHtml(String(officialSummary?.eligible_clients ?? '—'))}</div>
      </div>
      <div class="metric-context" title="${escapeHtml(rateTip)}">
        <div class="metric-context__label">${helpTip(EXECUTIVE_KPI_LABELS.responseRate, rateTip)}</div>
        <div class="metric-context__value">${escapeHtml(rr)}</div>
      </div>
    </div>`;
}

function compositionCard(label, count, pct, tone, widthPct) {
  return `
    <article class="composition-card composition-card--${tone}">
      <div class="composition-card__label">${label === 'Promotores' ? helpTip(label, TIPS.promotores) : label === 'Neutros' ? helpTip(label, TIPS.neutros) : label === 'Detratores' ? helpTip(label, TIPS.detratores) : escapeHtml(label)}</div>
      <div class="composition-card__value">${escapeHtml(String(count))}</div>
      <div class="composition-card__pct">${escapeHtml(formatPct(pct))}</div>
      <div class="composition-bar"><span style="width:${widthPct}%"></span></div>
    </article>`;
}

function renderCsatComplementary(cycleCode) {
  if (!hasCsatArtifacts()) return '';
  const csat = getCsatSummary(cycleCode);
  if (!csat || !csat.valid_responses) {
    return `
      <div class="section-head">
        <h2 class="section-title">Satisfação complementar</h2>
        <p class="section-subtitle" title="NPS mede recomendação; CSAT mede satisfação com a experiência avaliada.">Sem respostas CSAT mapeadas para este ciclo.</p>
      </div>`;
  }
  return `
    <div class="section-head">
      <h2 class="section-title">Satisfação complementar</h2>
      <p class="section-subtitle" title="NPS mede recomendação; CSAT mede satisfação com a experiência avaliada.">CSAT por ciclo — métrica separada do NPS (reuniões avaliadas, escala 0–5).</p>
    </div>
    <div class="metric-compact-grid metric-compact-grid--secondary">
      <article class="metric-compact" title="NPS mede recomendação; CSAT mede satisfação com a experiência avaliada.">
        <div class="metric-compact__label">CSAT médio</div>
        <div class="metric-compact__value">${escapeHtml(formatCsatAverageWithScale(csat.average_score))}</div>
        <div class="metric-compact__note">n = ${escapeHtml(String(csat.valid_responses))} respostas · ${escapeHtml(String(csat.distinct_clients ?? '—'))} clientes</div>
      </article>
      <article class="metric-compact" title="Satisfeitos: nota ≥ 4 (top-2 box, escala 0–5). Ver csat_summary / reconciliação legado.">
        <div class="metric-compact__label">CSAT satisfeitos</div>
        <div class="metric-compact__value">${escapeHtml(formatPct(csat.satisfied_pct, 1))}</div>
        <div class="metric-compact__note">n = ${escapeHtml(String(csat.satisfied_responses ?? '—'))} satisfeitos / ${escapeHtml(String(csat.valid_responses))} respostas</div>
      </article>
    </div>`;
}

function renderComposition(currentSummary) {
  return `
    <div class="section-head">
      <h2 class="section-title">Composição NPS</h2>
      <p class="section-subtitle">Participação por categoria no ciclo selecionado</p>
    </div>
    <div class="composition-grid">
      ${compositionCard('Promotores', currentSummary?.promoters ?? 0, currentSummary?.promoter_pct, 'promoter', currentSummary?.promoter_pct ?? 0)}
      ${compositionCard('Neutros', currentSummary?.passives ?? 0, currentSummary?.passive_pct, 'passive', currentSummary?.passive_pct ?? 0)}
      ${compositionCard('Detratores', currentSummary?.detractors ?? 0, currentSummary?.detractor_pct, 'detractor', currentSummary?.detractor_pct ?? 0)}
    </div>`;
}

function renderExecutiveReadingCard({ headline, highlights }) {
  const bullets =
    highlights.length > 0
      ? highlights.map((t) => `<li>${escapeHtml(t)}</li>`).join('')
      : '<li class="note-muted">Sem sinais adicionais para o recorte atual.</li>';
  return `
    <section class="exec-diagnosis card exec-reading exec-reading--compact" aria-labelledby="exec-diagnosis-title">
      <h2 class="section-title section-title--flush" id="exec-diagnosis-title">Leitura executiva</h2>
      <p class="exec-diagnosis__headline">${escapeHtml(headline)}</p>
      <ul class="exec-diagnosis__bullets exec-diagnosis__bullets--compact">${bullets}</ul>
      <div class="exec-reading__actions">
        <button type="button" class="btn btn--ghost btn--sm exec-diagnosis__cta" id="btn-diagnosis-full">Ver diagnóstico completo →</button>
        <button type="button" class="btn btn--ghost btn--sm" id="btn-diagnosis-explore">Explorar diagnóstico</button>
      </div>
    </section>`;
}

export function closeDiagnosisDrawer() {
  document.getElementById('diagnosis-drawer')?.classList.remove('is-open');
  const backdrop = document.getElementById('diagnosis-drawer-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-expanded', 'false');
}

function renderModalKpi(label, value) {
  return `<article class="exec-modal-kpi"><span class="exec-modal-kpi__label">${escapeHtml(label)}</span><span class="exec-modal-kpi__value">${value}</span></article>`;
}

function openDiagnosisDrawer(modalModel, { exploreOnly = false } = {}) {
  const drawer = document.getElementById('diagnosis-drawer');
  const backdrop = document.getElementById('diagnosis-drawer-backdrop');
  if (!drawer || !modalModel) return;

  const section = (title, body) =>
    `<section class="exec-modal-section"><h3 class="exec-modal-section__title">${escapeHtml(title)}</h3>${body}</section>`;

  const mov = modalModel.movement;
  const movText =
    mov?.available && mov.worsened_clients > 0
      ? `<p>${escapeHtml(String(mov.paired ?? 0))} clientes pareados · ${escapeHtml(String(mov.worsened_clients))} migraram para categoria inferior.</p>`
      : '<p class="note-muted">Sem migração negativa relevante no recorte.</p>';
  const topMig = mov?.topNegative
    ? `<p class="exec-modal-migration"><strong>${escapeHtml(mov.topNegative.migration)}</strong><br>${escapeHtml(String(mov.topNegative.count))} clientes</p>`
    : '';

  const epList = (modalModel.eps ?? [])
    .map(
      (e) =>
        `<li><strong>${escapeHtml(e.ep_name)}</strong> · n=${escapeHtml(String(e.n))} · Δ pareado ${escapeHtml(formatDeltaPp(e.delta_nps_paired))}</li>`,
    )
    .join('');

  const voc = modalModel.voc;
  const vocBlock = voc
    ? `<p><strong>${escapeHtml(voc.topic)}</strong></p>
       <ul class="exec-modal-list">
         <li>${escapeHtml(formatPct(voc.pctResponses, 1))} dos comentários classificados</li>
         <li>${escapeHtml(formatPct(voc.negativePct, 1))} de valência negativa no tema</li>
       </ul>`
    : '<p class="note-muted">Sem tema negativo destacado.</p>';

  const driversBlock =
    modalModel.drivers?.length > 0
      ? `<ul class="exec-modal-list">${modalModel.drivers.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
      : '<p class="note-muted">Drivers indisponíveis para este ciclo.</p>';

  const exploreBlock =
    modalModel.managementQuestions?.length > 0
      ? `<div class="mgmt-questions">${modalModel.managementQuestions
          .map(
            (q) => `<details class="mgmt-q"><summary>${escapeHtml(q.question)}</summary><p>${escapeHtml(q.answer)}</p></details>`,
          )
          .join('')}</div>`
      : '<p class="note-muted">Perguntas de gestão indisponíveis.</p>';

  const summaryBlock = `<div class="exec-modal-kpi-grid">
        ${renderModalKpi('NPS atual', escapeHtml(formatNps(modalModel.overall?.nps)))}
        ${renderModalKpi('Variação', escapeHtml(formatDeltaPts(modalModel.overall?.nps, modalModel.overall?.previousNps)))}
        ${renderModalKpi('Respostas', escapeHtml(String(modalModel.overall?.validResponses ?? '—')))}
        ${renderModalKpi('Clientes pareados', escapeHtml(String(modalModel.overall?.pairedClients ?? '—')))}
      </div>`;

  drawer.innerHTML = `
    <header class="drawer__header">
      <h2>${exploreOnly ? 'Explorar diagnóstico' : 'Diagnóstico'} — ${escapeHtml(modalModel.cycleName ?? '')}</h2>
      <button type="button" class="drawer__close" id="diagnosis-drawer-close" aria-label="Fechar">×</button>
    </header>
    <div class="drawer__body exec-modal-body">
      ${exploreOnly ? section('Perguntas de gestão', exploreBlock) : ''}
      ${!exploreOnly ? section('Resumo', summaryBlock) : ''}
      ${!exploreOnly ? section('Movimento', `${movText}${topMig}`) : ''}
      ${!exploreOnly ? section('EPs em atenção', epList ? `<ul class="exec-modal-list">${epList}</ul>` : '<p class="note-muted">Nenhum EP em destaque.</p>') : ''}
      ${!exploreOnly ? section('Voz do Cliente', vocBlock) : ''}
      ${!exploreOnly ? section('Drivers', driversBlock) : ''}
    </div>`;

  drawer.classList.add('is-open');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-expanded', 'true');
  drawer.focus();

  document.getElementById('diagnosis-drawer-close')?.addEventListener('click', closeDiagnosisDrawer, { once: true });
  backdrop?.addEventListener('click', closeDiagnosisDrawer, { once: true });
}

function renderTotalVsPaired(currentSummary, previousSummary, paired, recorteActive) {
  return `
    <div class="section-head">
      <h2 class="section-title">Total × mesmos clientes</h2>
      <p class="section-subtitle">${recorteActive ? 'Recorte atual vs mesmos clientes no recorte' : 'Base total vs clientes com resposta nos dois ciclos'}</p>
    </div>
    <div class="compare-hero">
      <div class="compare-hero__col">
        <div class="compare-hero__title">${recorteActive ? 'Recorte (atual)' : 'Base total'}</div>
        <div class="compare-hero__flow">${escapeHtml(formatNps(previousSummary?.nps))} → ${escapeHtml(formatNps(currentSummary?.nps))}</div>
        <div class="compare-hero__delta">${escapeHtml(formatDeltaPts(currentSummary?.nps, previousSummary?.nps))}</div>
        ${recorteActive ? `<div class="compare-hero__meta">n = ${escapeHtml(String(currentSummary?.valid_responses ?? 0))}</div>` : ''}
      </div>
      <div class="compare-hero__col">
        <div class="compare-hero__title">Mesmos clientes</div>
        <div class="compare-hero__flow">${escapeHtml(formatNps(paired?.previous_nps_paired))} → ${escapeHtml(formatNps(paired?.current_nps_paired))}</div>
        <div class="compare-hero__delta">${escapeHtml(formatDeltaPts(paired?.current_nps_paired, paired?.previous_nps_paired))}</div>
        <div class="compare-hero__meta">${escapeHtml(String(paired?.paired_clients ?? 0))} clientes pareados</div>
      </div>
    </div>`;
}

function chartSection(title, subtitle, canvasId, href, ariaLabel, wrapClass = '') {
  const link = href
    ? `<a class="exec-chart-link" href="${escapeAttr(href)}">Ver análise →</a>`
    : '';
  const wrapExtra = wrapClass ? ` ${wrapClass}` : '';
  return `
    <div class="section-head section-head--row">
      <div>
        <h2 class="section-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="section-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${link}
    </div>
    <article class="chart-card exec-chart-card"><div class="chart-wrap${wrapExtra}"><canvas id="${escapeAttr(canvasId)}" aria-label="${escapeAttr(ariaLabel)}"></canvas></div></article>`;
}

function mountDistributionChart(canvas, summary) {
  const dist = summary?.score_distribution ?? {};
  const labels = [...Array(11).keys()].map(String);
  const data = labels.map((k) => dist[k] ?? 0);
  const colors = labels.map((_, i) => zoneColor(i));
  const total = summary?.valid_responses ?? 1;
  charts.push(
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Respostas', data, backgroundColor: colors, borderRadius: 8, borderSkipped: false }],
      },
      options: chartPresentationOptions({
        plugins: {
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.raw;
                const pct = ((v / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
                return ` ${v} respostas (${pct}%)`;
              },
            },
          },
          legend: { display: false },
        },
        scales: {
          x: { title: { display: true, text: 'Nota' } },
          y: { beginAtZero: true, title: { display: true, text: 'Quantidade' } },
        },
      }),
    }),
  );
}

function mountStackedChart(canvas, currentSummary, previousSummary) {
  const labels = [previousSummary?.cycle_name ?? 'Anterior', currentSummary?.cycle_name ?? 'Atual'];
  charts.push(
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Detratores',
            data: [previousSummary?.detractors ?? 0, currentSummary?.detractors ?? 0],
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-detractor').trim(),
            borderRadius: 6,
          },
          {
            label: 'Neutros',
            data: [previousSummary?.passives ?? 0, currentSummary?.passives ?? 0],
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-passive').trim(),
            borderRadius: 6,
          },
          {
            label: 'Promotores',
            data: [previousSummary?.promoters ?? 0, currentSummary?.promoters ?? 0],
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-promoter').trim(),
            borderRadius: 6,
          },
        ],
      },
      options: chartPresentationOptions({
        plugins: {
          tooltip: {
            callbacks: {
              footer(items) {
                const idx = items[0]?.dataIndex ?? 0;
                const s = idx === 0 ? previousSummary : currentSummary;
                return `n=${s?.valid_responses ?? 0}`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      }),
    }),
  );
}

function mountHistoryChart(canvas) {
  const cycles = getCycles();
  const labels = [];
  const npsData = [];
  for (const c of cycles) {
    const s = getCycleSummary(c.cycle_code);
    if (!s) continue;
    labels.push(c.cycle_name);
    npsData.push(s.nps);
  }
  const coral = getComputedStyle(document.documentElement).getPropertyValue('--color-coral').trim();
  const coralSoft = getComputedStyle(document.documentElement).getPropertyValue('--color-coral-soft').trim();
  charts.push(
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'NPS',
            data: npsData,
            borderColor: coral,
            backgroundColor: coralSoft,
            tension: 0.2,
            fill: true,
          },
        ],
      },
      options: chartPresentationOptions({
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label(ctx) {
                return ` NPS: ${formatNps(ctx.raw)}`;
              },
            },
          },
        },
        scales: { y: { title: { display: true, text: 'NPS' } } },
      }),
    }),
  );
}

export function renderExecutivo(root, ctx = {}) {
  destroyCharts();
  closeDiagnosisDrawer();
  closeRespondentsDrawer();
  const signal = ctx.signal;
  const filters = getFilters();
  const filterCtx = getGlobalFilterContext(filters.cycleCode, filters);
  const currentCycle = getCycles().find((c) => c.cycle_code === filters.cycleCode);
  const officialSummary = filterCtx?.officialSummary ?? getExecutiveOfficialSummary(filters.cycleCode);
  const currentSummary = filterCtx?.displaySummary ?? officialSummary;
  const prevCycle = getPreviousCycle(filters.cycleCode);
  const previousSummary = filterCtx?.displayPrevious ?? (prevCycle ? getCycleSummary(prevCycle.cycle_code) : null);
  const paired = filterCtx?.recorteActive
    ? filterCtx.pairedDisplay
    : getPairedCycles(filters.cycleCode);
  const recorteActive = filterCtx?.recorteActive ?? false;
  const diagnosis = hasExecutiveDiagnosis(filters.cycleCode)
    ? getExecutiveDiagnosis(filters.cycleCode)
    : null;

  if (!officialSummary) {
    root.innerHTML = `
      ${renderHero(currentCycle, null)}
      <div class="gd-status" role="status"><p>Resumo indisponível para o ciclo selecionado.</p></div>`;
    return;
  }

  const pairedForView = filterCtx?.pairedDisplay ?? paired;
  const modalModel = buildExecutiveModalModel({
    currentSummary,
    previousSummary,
    paired: pairedForView,
    migrationMatrix: filterCtx?.migrationMatrix,
    diagnosisFallback: diagnosis,
    currentCycleName: currentCycle?.cycle_name ?? diagnosis?.cycle_name,
  });

  const stackedSection = previousSummary
    ? chartSection(
        'Composição comparada',
        'P/N/D empilhado por ciclo',
        'chart-stack',
        '#/movimento',
        'Composição NPS empilhada',
      )
    : '';

  root.innerHTML = `
    <div class="executivo-page">
    ${renderHero()}
    ${renderDataSourceNotice('executivo')}
    ${renderFilterRecorteBanner(filterCtx)}
    ${renderKpiRow(currentSummary, previousSummary, currentCycle, prevCycle)}
    ${renderSampleRow(currentSummary, officialSummary, recorteActive)}
    <section class="executivo-charts" aria-label="Gráficos principais">
      ${chartSection('Histórico de NPS', 'Evolução por ciclo analítico', 'chart-history', '#/historico-nps', 'NPS por ciclo', 'chart-wrap--tall')}
      ${renderComposition(currentSummary)}
      ${stackedSection}
      ${chartSection('Distribuição das notas', 'Frequência de 0 a 10', 'chart-dist', '#/movimento', 'Distribuição das notas')}
    </section>
    ${renderTotalVsPaired(currentSummary, previousSummary, pairedForView, recorteActive)}
    ${renderExecutivoCycleSnapshot()}
    ${renderQualityNotes(officialSummary, prevCycle ? getCycleSummary(prevCycle.cycle_code) : null)}
    </div>
  `;

  const opts = signal ? { signal } : undefined;
  bindRespondentsDrawer(filters.cycleCode, signal);
  if (signal) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDiagnosisDrawer();
        closeRespondentsDrawer();
      }
    }, { signal });
  }

  mountDistributionChart(document.getElementById('chart-dist'), currentSummary);
  if (previousSummary) mountStackedChart(document.getElementById('chart-stack'), currentSummary, previousSummary);
  mountHistoryChart(document.getElementById('chart-history'));
}
