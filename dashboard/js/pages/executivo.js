import {
  getCycleSummary,
  getPreviousCycle,
  getPairedCycles,
  getCycles,
  getDataState,
  getCsatSummary,
  hasCsatArtifacts,
  getExecutiveDiagnosis,
  hasExecutiveDiagnosis,
  getGlobalFilterContext,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import { renderFilterRecorteBanner } from '../filters/filter-context.mjs';
import { buildExecutiveReading } from '../data/store-core.mjs';
import {
  formatNps,
  formatPct,
  formatDeltaPts,
  formatDate,
  cycleStatusLabel,
  formatNpsRange,
  formatCsatAverageWithScale,
} from '../utils/format.js';
import { escapeHtml } from '../utils/escape-html.js';
import { sectionLead, helpTip, TIPS } from '../ui/help.js';
import { EXECUTIVE_KPI_LABELS, POPULATION_TIPS } from '../data/population-transparency.mjs';
import { bindRespondentsDrawer, closeRespondentsDrawer } from '../ui/respondents-drawer.js';
import { renderExecutivoManagementInsightsSection } from './executivo-management-insights.js';

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

function renderHero(currentCycle, currentSummary) {
  const dataState = getDataState();
  const cutoff = formatDate(currentSummary?.data_cutoff ?? dataState?.dataCutoff);
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Visão executiva</p>
        <h1 class="hero__title">NPS — Diagnóstico de Gestão</h1>
        <p class="page-header__lead">Resumo geral do NPS, comparação com o ciclo anterior e principais sinais de atenção.</p>
      </div>
      <div class="chip-row">
        <span class="chip-modern">${escapeHtml(currentCycle?.cycle_name ?? '—')}</span>
        <span class="chip-modern">${escapeHtml(cycleStatusLabel(currentSummary?.status ?? currentCycle?.status))}</span>
        <span class="chip-modern">Atualizado ${escapeHtml(cutoff)}</span>
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
        <div class="metric-hero__note">${escapeHtml(currentCycle?.cycle_name ?? '—')}</div>
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
  const ci =
    recorteActive || officialSummary?.nps_ci_low == null
      ? '—'
      : formatNpsRange(officialSummary?.nps_ci_low, officialSummary?.nps_ci_high);
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
        <div class="metric-context__label">${helpTip(EXECUTIVE_KPI_LABELS.clientsWithSend, TIPS.clientsWithSend)}</div>
        <div class="metric-context__value">${recorteActive ? '—' : escapeHtml(String(officialSummary?.eligible_clients ?? '—'))}</div>
      </div>
      <div class="metric-context" title="${escapeHtml(rateTip)}">
        <div class="metric-context__label">${helpTip(EXECUTIVE_KPI_LABELS.responseRate, rateTip)}</div>
        <div class="metric-context__value">${escapeHtml(rr)}</div>
      </div>
      <div class="metric-context">
        <div class="metric-context__label">${helpTip('IC95 NPS', recorteActive ? 'IC95 só está definido para o ciclo oficial completo.' : TIPS.ic95)}</div>
        <div class="metric-context__value">${escapeHtml(ci)}</div>
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

function sourcesHint(artifacts) {
  if (!artifacts?.length) return '';
  return `<span class="exec-diagnosis__sources" title="Fonte da leitura">Fonte: ${escapeHtml(artifacts.join(', '))}</span>`;
}

function renderExecutiveDiagnosisBlock(diagnosis) {
  if (!diagnosis) {
    return `<p class="placeholder-note" role="status">Diagnóstico executivo indisponível. Execute <code>npm run generate:diagnosis</code>.</p>`;
  }
  const bullets = (diagnosis.executive_summary ?? []).map(
    (b) => `<li>${escapeHtml(b.text)} ${sourcesHint(b.source_artifacts)}</li>`,
  );
  const questions = (diagnosis.management_questions ?? [])
    .map(
      (q) => `
      <details class="mgmt-q">
        <summary>${escapeHtml(q.question)}</summary>
        <p>${escapeHtml(q.answer)}</p>
        ${sourcesHint(q.source_artifacts)}
      </details>`,
    )
    .join('');
  return `
    <section class="exec-diagnosis card exec-reading" aria-labelledby="exec-diagnosis-title">
      <div class="exec-reading__main">
        <h2 class="section-title section-title--flush" id="exec-diagnosis-title">Leitura executiva</h2>
        ${sectionLead('Síntese automática com base nos mesmos arquivos do dashboard — sem alterar os números oficiais.')}
        <p class="exec-diagnosis__headline">${escapeHtml(diagnosis.headline?.text ?? '—')}</p>
        <ul class="exec-diagnosis__bullets">${bullets.join('') || '<li>Sem bullets para este ciclo.</li>'}</ul>
        <div class="exec-reading__actions">
          <button type="button" class="btn btn--secondary" id="btn-diagnosis-full">Ver diagnóstico completo</button>
        </div>
      </div>
      <aside class="exec-reading__aside">
        <h3 class="section-title section-title--flush">Responder em 5 minutos</h3>
        <div class="mgmt-questions">${questions}</div>
      </aside>
    </section>`;
}

export function closeDiagnosisDrawer() {
  document.getElementById('diagnosis-drawer')?.classList.remove('is-open');
  const backdrop = document.getElementById('diagnosis-drawer-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-expanded', 'false');
}

function openDiagnosisDrawer(diagnosis) {
  const drawer = document.getElementById('diagnosis-drawer');
  const backdrop = document.getElementById('diagnosis-drawer-backdrop');
  if (!drawer || !diagnosis) return;

  const section = (title, body) =>
    `<section><h3>${escapeHtml(title)}</h3>${body}</section>`;

  const list = (items) =>
    `<ul>${items.map((i) => `<li>${escapeHtml(String(i))}</li>`).join('')}</ul>`;

  drawer.innerHTML = `
    <header class="drawer__header">
      <h2>Diagnóstico — ${escapeHtml(diagnosis.cycle_name ?? '')}</h2>
      <button type="button" class="drawer__close" id="diagnosis-drawer-close" aria-label="Fechar">×</button>
    </header>
    <div class="drawer__body">
      ${section('Resultado geral', list([
        `NPS: ${formatNps(diagnosis.overall?.current_nps)} (Δ ${formatDeltaPts(diagnosis.overall?.current_nps, diagnosis.overall?.previous_nps)})`,
        `Respostas: ${diagnosis.overall?.valid_responses ?? '—'}`,
        `IC95: ${formatNpsRange(diagnosis.overall?.ci95?.low, diagnosis.overall?.ci95?.high)}`,
      ]))}
      ${section('Mesmos clientes', `<p>${escapeHtml(diagnosis.paired?.comparison_text ?? '—')}</p><p>${escapeHtml(String(diagnosis.paired?.paired_clients ?? 0))} pareados · Δ NPS ${formatNps(diagnosis.paired?.delta_nps_paired)}</p>`)}
      ${section('Movimento', `<p>${escapeHtml(diagnosis.movement?.reading ?? '—')}</p>`)}
      ${section('Carteiras EP', list((diagnosis.eps?.eps_attention ?? []).map((e) => `${e.ep_name} (n=${e.n}, Δ pareado ${e.delta_nps_paired ?? '—'})`)) || ['Nenhum destaque.'])}
      ${section('Voz do Cliente', list((diagnosis.voc?.executive_lines ?? []).length ? diagnosis.voc.executive_lines : ['Sem leitura VoC.']))}
      ${section('Drivers', list((diagnosis.drivers?.executive_drivers ?? []).map((d) => d.text) || [diagnosis.drivers?.message ?? 'Indisponível']))}
      ${section('CSAT', `<p>Média ${formatCsatAverageWithScale(diagnosis.csat?.current_average)} · Satisfeitos ${formatPct(diagnosis.csat?.current_satisfied_pct, 1)}%</p>`)}
      ${section('Plano de ação', `<p>${escapeHtml(diagnosis.actions?.executive_line ?? '—')}</p>`)}
      ${section('Qualidade', list(diagnosis.quality?.flags ?? ['Sem flags']))}
      ${section('Metodologia', list(diagnosis.methodology_notes ?? []))}
    </div>`;

  drawer.classList.add('is-open');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-expanded', 'true');
  drawer.focus();

  document.getElementById('diagnosis-drawer-close')?.addEventListener('click', closeDiagnosisDrawer, { once: true });
  backdrop?.addEventListener('click', closeDiagnosisDrawer, { once: true });
}

function renderTotalVsPaired(currentSummary, previousSummary, paired, reading, comparisonText, recorteActive) {
  const pairedInsight = recorteActive
    ? ''
    : comparisonText ?? reading.find((l) => l.includes('mesmos clientes') || l.includes('base pareada')) ?? '';
  return `
    <div class="section-head">
      <h2 class="section-title">Total × mesmos clientes</h2>
      <p class="section-subtitle">${recorteActive ? 'Recorte atual vs mesmos clientes no recorte (com nota anterior)' : 'Denominadores distintos — interpretar cada bloco separadamente'}</p>
      ${sectionLead(recorteActive ? 'Com filtros ativos, ambos os blocos usam o mesmo conjunto de clientes do recorte.' : 'Aqui comparamos o resultado geral com o resultado de quem respondeu nos dois ciclos.')}
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
      ${pairedInsight ? `<p class="compare-hero__insight">${escapeHtml(pairedInsight)}</p>` : ''}
    </div>`;
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
  const low = [];
  const high = [];
  for (const c of cycles) {
    const s = getCycleSummary(c.cycle_code);
    if (!s) continue;
    labels.push(c.cycle_name);
    npsData.push(s.nps);
    low.push(s.nps_ci_low);
    high.push(s.nps_ci_high);
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
          {
            label: 'IC95 inferior',
            data: low,
            borderColor: 'transparent',
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'IC95 superior',
            data: high,
            borderColor: 'transparent',
            backgroundColor: coralSoft,
            pointRadius: 0,
            fill: '-1',
          },
        ],
      },
      options: chartPresentationOptions({
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.dataset.label === 'NPS') return ` NPS: ${formatNps(ctx.raw)}`;
                return ` ${ctx.dataset.label}: ${formatNps(ctx.raw)}`;
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
  const officialSummary = filterCtx?.officialSummary ?? getCycleSummary(filters.cycleCode);
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

  const reading = recorteActive
    ? []
    : buildExecutiveReading({
        currentSummary: officialSummary,
        previousSummary: prevCycle ? getCycleSummary(prevCycle.cycle_code) : null,
        paired: getPairedCycles(filters.cycleCode),
      });
  const stackedSection = previousSummary
    ? `<div class="section-head"><h2 class="section-title">Composição comparada</h2><p class="section-subtitle">Detratores, neutros e promotores — empilhado por ciclo</p></div>
    <article class="chart-card"><div class="chart-wrap"><canvas id="chart-stack" aria-label="Composição NPS empilhada"></canvas></div></article>`
    : `<div class="section-head"><h2 class="section-title">Composição comparada</h2></div>
    <p class="placeholder-note" role="status">Comparativo empilhado disponível a partir do segundo ciclo analítico.</p>`;

  root.innerHTML = `
    ${renderHero(currentCycle, officialSummary)}
    ${renderFilterRecorteBanner(filterCtx)}
    ${renderExecutiveDiagnosisBlock(diagnosis)}
    ${renderExecutivoManagementInsightsSection()}
    ${renderKpiRow(currentSummary, previousSummary, currentCycle, prevCycle)}
    ${renderSampleRow(currentSummary, officialSummary, recorteActive)}
    ${renderCsatComplementary(filters.cycleCode)}
    ${renderComposition(currentSummary)}
    ${renderTotalVsPaired(currentSummary, previousSummary, paired, reading, diagnosis?.paired?.comparison_text, recorteActive)}
    <div class="section-head"><h2 class="section-title">Distribuição das notas</h2><p class="section-subtitle">Frequência de cada nota de 0 a 10</p></div>
    <article class="chart-card"><div class="chart-wrap"><canvas id="chart-dist" aria-label="Distribuição das notas"></canvas></div></article>
    ${stackedSection}
    <div class="section-head"><h2 class="section-title">Histórico de NPS</h2><p class="section-subtitle">Evolução por ciclo analítico com IC95</p></div>
    <article class="chart-card"><div class="chart-wrap chart-wrap--tall"><canvas id="chart-history" aria-label="NPS por ciclo"></canvas></div></article>
    ${
      diagnosis
        ? ''
        : `<div class="insight-box">
      <h2 class="section-title section-title--flush">Leitura do ciclo</h2>
      <ul>${reading.map((l) => `<li>${escapeHtml(l)}</li>`).join('') || '<li>Sem leitura automática para os filtros atuais.</li>'}</ul>
    </div>`
    }
    ${renderQualityNotes(officialSummary, prevCycle ? getCycleSummary(prevCycle.cycle_code) : null)}
  `;

  const opts = signal ? { signal } : undefined;
  document.getElementById('btn-diagnosis-full')?.addEventListener(
    'click',
    () => openDiagnosisDrawer(diagnosis),
    opts,
  );
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
