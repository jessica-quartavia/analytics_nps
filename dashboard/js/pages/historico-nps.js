import {
  getHistoricalNpsSummary,
  getHistoricalNpsResponses,
  getHistoricalNpsClients,
  getHistoricalNpsEnriched,
  getHistoricalNpsEnrichedQuality,
  getCohortPaymentDateAudit,
  getCustomerNpsCohorts,
  getSnapshot,
} from '../data/analytics-store.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatNps, formatPct } from '../utils/format.js';
import { cycleSortKey } from '../utils/cycle-sort.mjs';
import {
  defaultHistoricoFilters,
  filterResponses,
  computeFilteredCycleSummary,
  clientRecurrenceMap,
  epOptionsFromResponses,
  safraOptionsFromResponses,
  cycleOptions,
  npsFromScores,
} from '../data/historico-nps-view.mjs';
import {
  filterEnrichedRows,
  filterResponsesViaEnriched,
  median,
  aggregateNpsBucket,
  mechanismBreakdown,
  epTransferBucket,
  financialQuartileBuckets,
  buildSafraEntradaSeries,
  buildSafraCicloMatrix,
  buildClientExplorerRows,
  groupEnrichedByClient,
  snapshotDisplayDate,
  officialMedicoesMatch,
  financialBucketLabel,
} from '../data/historico-nps-enriched-view.mjs';
import {
  renderHistoricoHeader,
  renderHistoricoFilters,
  historicoKpiCard,
  renderTenureBars,
  renderBucketTable,
  renderMechanismSection,
  renderCollapsibleSection,
  renderOfficialTable,
  renderQualityFooter,
  renderClientExplorerTable,
  renderSafraMatrix,
} from './historico-nps-render.mjs';
import { openHistoricoClientDrawer, closeHistoricoClientDrawer } from '../ui/historico-client-drawer.mjs';
import { closeHistoricoResponseDrawer } from '../ui/historico-response-drawer.mjs';
import { stickyFiltersEnabled, setStickyFiltersEnabled } from '../utils/sticky-filters.js';
import {
  prepareHistoricoDisplayCycles,
  uniqueCanonicalCycleList,
  formatNpsCycleLabel,
  canonicalizeNpsCycle,
} from '../utils/nps-cycle-labels.mjs';

let pageFilters = defaultHistoricoFilters();
let chartInstances = [];
let clientPage = 1;
let matrixMetric = 'nps';
let volMode = 'responses';
const PAGE_SIZE = 25;

function destroyCharts() {
  for (const c of chartInstances) c.destroy();
  chartInstances = [];
}

function filtersAffectRecorte(f) {
  return Object.entries(f).some(([k, v]) => v && k !== 'search');
}

function renderKpis(summary, meta, enrichedFiltered, recMap, lastOff, prevOff, currentCycle) {
  const delta =
    lastOff?.nps_oficial != null && prevOff?.nps_oficial != null
      ? Math.round((lastOff.nps_oficial - prevOff.nps_oficial) * 10) / 10
      : null;
  const cycleResponses = currentCycle
    ? enrichedFiltered.filter((r) => r.nps_cycle === currentCycle).length
    : enrichedFiltered.length;
  const recorrentes = [...recMap.values()].filter((n) => n >= 2).length;
  const tenureMed = median(enrichedFiltered.map((r) => r.months_since_entry).filter((n) => n != null));
  const meetMed = median(enrichedFiltered.map((r) => r.meetings_before_response));
  const mechKnown = enrichedFiltered.filter((r) => r.mechanism_temporal_status !== 'date_unavailable');
  const mechPct = mechKnown.length
    ? Math.round((1000 * mechKnown.filter((r) => r.has_implemented_mechanism_at_response).length) / mechKnown.length) / 10
    : null;

  return `<div class="historico-kpi-grid">
    ${historicoKpiCard('NPS oficial atual', lastOff?.nps_oficial != null ? formatNps(lastOff.nps_oficial) : '—', lastOff?.ciclo ?? '—')}
    ${historicoKpiCard('Variação', delta != null ? formatNps(delta) : '—', 'vs medição anterior', 'historico-kpi-card--variation')}
    ${historicoKpiCard('Respostas do ciclo', String(cycleResponses), currentCycle ? `ciclo ${currentCycle}` : 'recorte PIT')}
    ${historicoKpiCard('Clientes únicos históricos', String(meta?.unique_clients ?? '—'), 'consolidado dedupe')}
    ${historicoKpiCard('Clientes recorrentes', String(recorrentes), '2+ respostas')}
    ${historicoKpiCard('Mediana tempo de relacionamento', tenureMed != null ? `${Math.round(tenureMed * 10) / 10} meses` : '—', `n=${enrichedFiltered.length} respostas PIT`)}
    ${historicoKpiCard('Mediana reuniões (PIT)', meetMed != null ? String(Math.round(meetMed * 10) / 10) : '—', 'antes da resposta')}
    ${historicoKpiCard('% c/ mecanismo na resposta', mechPct != null ? formatPct(mechPct) : '—', 'somente data temporal conhecida')}
  </div>`;
}

function bindCharts(summary, filteredSummary, meta, safraEntrada, safraNps, tenureData, meetingsData, recencyData) {
  const cycles = prepareHistoricoDisplayCycles(summary?.cycles ?? []);
  const labels = cycles.map((c) => formatNpsCycleLabel(c.ciclo));
  const official = cycles.map((c) => c.nps_oficial);
  const filMap = new Map(
    filteredSummary.map((x) => [canonicalizeNpsCycle(x.ciclo), x.nps_filtrado]),
  );
  const filteredLine = cycles.map((c) => filMap.get(c.ciclo) ?? null);
  const showFiltered = filtersAffectRecorte(pageFilters);

  const elNps = document.getElementById('chart-hist-nps');
  if (elNps && typeof Chart !== 'undefined') {
    const datasets = [
      { label: 'NPS oficial', data: official, borderColor: '#c44a2a', tension: 0.25, fill: false },
    ];
    if (showFiltered) {
      datasets.push({
        label: 'NPS do recorte filtrado',
        data: filteredLine,
        borderColor: '#64748b',
        borderDash: [6, 4],
        tension: 0.25,
        fill: false,
      });
    }
    chartInstances.push(
      new Chart(elNps, {
        type: 'line',
        data: { labels, datasets },
        options: {
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                afterLabel(ctx) {
                  const c = cycles[ctx.dataIndex];
                  if (!c) return '';
                  return `N: ${c.respostas ?? c.respostas_derivadas}\nProm: ${c.promotores} Neut: ${c.neutros} Det: ${c.detratores}`;
                },
              },
            },
          },
        },
      }),
    );
  }

  const elVol = document.getElementById('chart-hist-volume');
  if (elVol && typeof Chart !== 'undefined') {
    const vol = cycles.map((c) => (volMode === 'clients' ? c.clientes_unicos : c.respostas ?? c.respostas_derivadas));
    chartInstances.push(
      new Chart(elVol, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: volMode === 'clients' ? 'Clientes únicos' : 'Respostas', data: vol, backgroundColor: '#e85d3a' }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }),
    );
  }

  const elStack = document.getElementById('chart-hist-pnd');
  if (elStack && typeof Chart !== 'undefined') {
    chartInstances.push(
      new Chart(elStack, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Promotores', data: cycles.map((c) => c.pct_promotores), backgroundColor: '#2d8a5f', stack: 's' },
            { label: 'Neutros', data: cycles.map((c) => c.pct_neutros), backgroundColor: '#94a3b8', stack: 's' },
            { label: 'Detratores', data: cycles.map((c) => c.pct_detratores), backgroundColor: '#c44a2a', stack: 's' },
          ],
        },
        options: {
          maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
        },
      }),
    );
  }

  const elSafraEnt = document.getElementById('chart-safra-entrada');
  if (elSafraEnt && typeof Chart !== 'undefined' && safraEntrada.length) {
    chartInstances.push(
      new Chart(elSafraEnt, {
        type: 'bar',
        data: {
          labels: safraEntrada.map((s) => s.safra),
          datasets: [
            { type: 'bar', label: 'Clientes', data: safraEntrada.map((s) => s.clientes), backgroundColor: '#e85d3a', yAxisID: 'y' },
            {
              type: 'line',
              label: '% respondeu NPS',
              data: safraEntrada.map((s) => s.pct_answered),
              borderColor: '#c44a2a',
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            y: { position: 'left', title: { display: true, text: 'Clientes' } },
            y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } },
          },
        },
      }),
    );
  }

  const elSafraNps = document.getElementById('chart-safra-nps');
  if (elSafraNps && typeof Chart !== 'undefined') {
    const keys = Object.keys(safraNps).sort((a, b) => cycleSortKey(a) - cycleSortKey(b));
    chartInstances.push(
      new Chart(elSafraNps, {
        type: 'bar',
        data: {
          labels: keys,
          datasets: [{ label: 'NPS por safra', data: keys.map((k) => safraNps[k].nps), backgroundColor: '#c44a2a' }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }),
    );
  }

  const elTenure = document.getElementById('chart-tenure');
  if (elTenure && typeof Chart !== 'undefined') {
    const order = ['0–3 meses', '3–6 meses', '6–12 meses', '12–18 meses', '18–24 meses', '24+ meses'];
    chartInstances.push(
      new Chart(elTenure, {
        type: 'bar',
        data: {
          labels: order.filter((k) => tenureData[k]),
          datasets: [{ label: 'NPS', data: order.filter((k) => tenureData[k]).map((k) => tenureData[k].nps), backgroundColor: '#64748b' }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }),
    );
  }

  const elMeet = document.getElementById('chart-meetings');
  if (elMeet && typeof Chart !== 'undefined') {
    const order = ['0', '1–2', '3–5', '6+'];
    chartInstances.push(
      new Chart(elMeet, {
        type: 'bar',
        data: {
          labels: order.filter((k) => meetingsData[k]),
          datasets: [{ data: order.filter((k) => meetingsData[k]).map((k) => meetingsData[k].nps), backgroundColor: '#e85d3a' }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }),
    );
  }

  const elRec = document.getElementById('chart-recency');
  if (elRec && typeof Chart !== 'undefined') {
    const order = ['Nunca teve reunião', '0–30 dias', '31–60 dias', '61–90 dias', '90+ dias'];
    chartInstances.push(
      new Chart(elRec, {
        type: 'bar',
        data: {
          labels: order.filter((k) => recencyData[k]),
          datasets: [{ data: order.filter((k) => recencyData[k]).map((k) => recencyData[k].nps), backgroundColor: '#94a3b8' }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }),
    );
  }

  const rec = document.getElementById('chart-hist-recurrence');
  if (rec && typeof Chart !== 'undefined' && meta?.recurrence) {
    const r = meta.recurrence;
    chartInstances.push(
      new Chart(rec, {
        type: 'doughnut',
        data: {
          labels: ['1×', '2×', '3+'],
          datasets: [{ data: [r.once, r.twice, r.three_plus], backgroundColor: ['#e2e8f0', '#e85d3a', '#c44a2a'] }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      }),
    );
  }
}

function bindPage(root, ctx) {
  const { enrichedAll, cohorts } = ctx;
  root.querySelector('[data-hist-filters]')?.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.dataset.f) return;
    pageFilters = { ...pageFilters, [t.dataset.f]: t.value };
    clientPage = 1;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-f="search"]')?.addEventListener('input', (ev) => {
    pageFilters = { ...pageFilters, search: ev.target.value };
    clientPage = 1;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-hist-sticky]')?.addEventListener('change', (ev) => {
    setStickyFiltersEnabled(ev.target.checked);
    renderHistoricoNps(root);
  });
  root.querySelector('[data-hist-clear-filters]')?.addEventListener('click', () => {
    pageFilters = defaultHistoricoFilters();
    clientPage = 1;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-vol-toggle]')?.addEventListener('click', (ev) => {
    volMode = ev.target.dataset.volToggle;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-matrix-metric]')?.addEventListener('change', (ev) => {
    matrixMetric = ev.target.value;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-cli-prev]')?.addEventListener('click', () => {
    if (clientPage > 1) {
      clientPage -= 1;
      renderHistoricoNps(root);
    }
  });
  root.querySelector('[data-cli-next]')?.addEventListener('click', () => {
    clientPage += 1;
    renderHistoricoNps(root);
  });
  root.querySelectorAll('.historico-client-row').forEach((row) => {
    const open = () => openHistoricoClientDrawer(row.dataset.clientId, enrichedAll, cohorts);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        open();
      }
    });
  });
}

export function closeHistoricoDrawer() {
  closeHistoricoClientDrawer();
  closeHistoricoResponseDrawer();
}

export function renderHistoricoNps(root) {
  destroyCharts();
  const summaryDoc = getHistoricalNpsSummary();
  const responsesDoc = getHistoricalNpsResponses();
  const clientsDoc = getHistoricalNpsClients();
  const enrichedDoc = getHistoricalNpsEnriched();
  const quality = getHistoricalNpsEnrichedQuality();
  const paymentAudit = getCohortPaymentDateAudit();
  const snapshot = getSnapshot();

  if (!summaryDoc?.meta) {
    root.innerHTML = `<p class="placeholder-note">Execute <code>npm run generate:phase1</code> e recarregue.</p>`;
    return;
  }

  const enrichedAll = enrichedDoc?.responses ?? [];
  if (!enrichedAll.length) {
    root.innerHTML = `<p class="placeholder-note">Dataset <code>historical_nps_enriched.json</code> ausente. Rode <code>npm run generate:phase1</code>.</p>`;
    return;
  }

  const meta = summaryDoc.meta;
  const summary = summaryDoc.summary;
  const allResponses = responsesDoc?.responses ?? [];
  const clientsAll = clientsDoc?.clients ?? [];
  const recMap = clientRecurrenceMap(clientsAll);
  const cohorts = (getCustomerNpsCohorts() ?? []).filter(
    (c) => !c.invalid_future_entry_date && !String(c.safra_trimestre ?? '').startsWith('2027'),
  );

  const enrichedFiltered = filterEnrichedRows(enrichedAll, pageFilters, recMap);
  const filtered = filterResponsesViaEnriched(allResponses, enrichedFiltered);
  const analyses = enrichedDoc?.analyses ?? {};
  const usePrecomputed = !filtersAffectRecorte(pageFilters);

  const tenureData = usePrecomputed
    ? analyses.nps_por_tenure ?? {}
    : aggregateNpsBucket(enrichedFiltered, (r) => r.tenure_bucket_at_response);
  const meetingsData = usePrecomputed
    ? analyses.nps_por_reunioes ?? {}
    : aggregateNpsBucket(enrichedFiltered, (r) => r.meetings_count_bucket);
  const recencyData = usePrecomputed
    ? analyses.nps_por_recencia_reuniao ?? {}
    : aggregateNpsBucket(enrichedFiltered, (r) => r.meeting_recency_bucket);
  const safraNps = usePrecomputed
    ? analyses.nps_por_safra ?? {}
    : aggregateNpsBucket(enrichedFiltered, (r) => r.safra_trimestre);
  const mech = mechanismBreakdown(enrichedFiltered);

  const official = (summary.cycles ?? []).filter((c) => c.is_official);
  const lastOff = official[official.length - 1];
  const prevOff = official[official.length - 2];
  const currentCycle = lastOff?.ciclo;
  const updatedLabel = snapshotDisplayDate(snapshot, enrichedDoc?.meta ?? summaryDoc.meta);
  const filteredSummary = computeFilteredCycleSummary(filtered, summary.cycles);

  const ciclos = uniqueCanonicalCycleList(enrichedAll.map((r) => r.nps_cycle));
  const safras = [
    ...new Set(cohorts.map((c) => c.safra_trimestre).filter(Boolean)),
  ].sort((a, b) => cycleSortKey(a) - cycleSortKey(b));
  const programas = [...new Set(enrichedAll.map((r) => r.programa).filter(Boolean))].sort();
  const eps = [...new Set(enrichedAll.map((r) => r.ep_current_or_resolved).filter(Boolean))].sort();

  const safraEntrada = buildSafraEntradaSeries(cohorts);
  const matrix = buildSafraCicloMatrix(enrichedFiltered, cohorts, matrixMetric);
  const explorerRows = buildClientExplorerRows(groupEnrichedByClient(enrichedFiltered), cohorts, recMap);

  const epBuckets = usePrecomputed
    ? analyses.nps_ep_transfers ?? {}
    : aggregateNpsBucket(enrichedFiltered, (r) => epTransferBucket(r.ep_transfers_before_response));
  const quartiles = financialQuartileBuckets(enrichedFiltered);
  const finBuckets = quartiles
    ? aggregateNpsBucket(enrichedFiltered, (r) =>
        financialBucketLabel(r.amount_paid_before_response, quartiles),
      )
    : {};

  const stickyOn = stickyFiltersEnabled();
  const officialOk = officialMedicoesMatch(summary.cycles);

  root.innerHTML = `<div class="historico-nps-page">
    ${renderHistoricoHeader(updatedLabel)}
    ${!officialOk ? '<p class="historico-alert">⚠ Valores oficiais divergem do baseline esperado — revisar datasets.</p>' : ''}
    ${renderHistoricoFilters(pageFilters, { ciclos, eps, safras, programas, stickyClass: stickyOn ? 'historico-filters-card--sticky' : '', stickyOn })}
    ${renderKpis(summary, meta, enrichedFiltered, recMap, lastOff, prevOff, currentCycle)}

    <section class="historico-block"><h2 class="historico-block__title">Evolução oficial</h2>
      <div class="historico-charts-grid">
        <div class="historico-chart-card historico-chart-card--hero">
          <div class="historico-chart-card__head"><h3 class="historico-chart-card__title">NPS por medição</h3>
            <p class="historico-chart-card__lead"><strong>NPS oficial</strong> vs <strong>NPS do recorte filtrado</strong> (quando há filtros).</p></div>
          <div class="historico-chart-frame historico-chart-frame--hero"><canvas id="chart-hist-nps"></canvas></div>
        </div>
        <div class="historico-chart-card">
          <div class="historico-chart-card__head"><h3 class="historico-chart-card__title">Respostas por medição</h3>
            <div class="historico-toggle"><button type="button" class="btn btn--ghost btn--sm ${volMode === 'responses' ? 'is-active' : ''}" data-vol-toggle="responses">Respostas</button>
            <button type="button" class="btn btn--ghost btn--sm ${volMode === 'clients' ? 'is-active' : ''}" data-vol-toggle="clients">Clientes</button></div></div>
          <div class="historico-chart-frame"><canvas id="chart-hist-volume"></canvas></div>
        </div>
        <div class="historico-chart-card historico-chart-card--wide">
          <div class="historico-chart-card__head"><h3 class="historico-chart-card__title">Distribuição P / N / D</h3></div>
          <div class="historico-chart-frame"><canvas id="chart-hist-pnd"></canvas></div>
        </div>
      </div>
    </section>

    <section class="historico-block"><h2 class="historico-block__title">Cobertura e participação</h2>
      <div class="historico-charts-grid">
        <div class="historico-chart-card">${renderRecurrenceInner(meta)}</div>
        <div class="historico-chart-card historico-chart-card--compact-kpi">${renderParticipation(meta)}</div>
      </div>
    </section>

    <section class="historico-block"><h2 class="historico-block__title">Safras (pagamento)</h2>
      <div class="historico-charts-grid">
        <div class="historico-chart-card"><div class="historico-chart-card__head"><h3 class="historico-chart-card__title">Entrada de clientes × cobertura NPS</h3></div>
          <div class="historico-chart-frame"><canvas id="chart-safra-entrada"></canvas></div></div>
        <div class="historico-chart-card"><div class="historico-chart-card__head"><h3 class="historico-chart-card__title">NPS dos clientes por safra de entrada</h3>
          <p class="historico-chart-card__lead">Não confundir com NPS do ciclo de medição.</p></div>
          <div class="historico-chart-frame"><canvas id="chart-safra-nps"></canvas></div></div>
      </div>
      <div class="safras-section-card"><div class="safras-section-card__head"><h3 class="safras-section-card__title">Matriz safra × ciclo</h3>
        <select class="select-input historico-matrix-metric" data-matrix-metric aria-label="Métrica da matriz">
          <option value="nps" ${matrixMetric === 'nps' ? 'selected' : ''}>NPS</option>
          <option value="avg" ${matrixMetric === 'avg' ? 'selected' : ''}>Nota média</option>
          <option value="responses" ${matrixMetric === 'responses' ? 'selected' : ''}>Respostas</option>
          <option value="pct" ${matrixMetric === 'pct' ? 'selected' : ''}>% da safra</option>
        </select></div>
        ${renderSafraMatrix(matrix, matrixMetric)}
      </div>
    </section>

    <section class="historico-block"><h2 class="historico-block__title">Tempo de relacionamento</h2>
      <div class="historico-charts-grid">
        <div class="historico-chart-card"><div class="historico-chart-frame"><canvas id="chart-tenure"></canvas></div></div>
        <div class="historico-chart-card">${renderTenureBars(tenureData)}</div>
      </div>
    </section>

    <section class="historico-block"><h2 class="historico-block__title">Relacionamento / reuniões</h2>
      <div class="historico-charts-grid">
        ${renderBucketTable('NPS por quantidade de reuniões (PIT)', 'meetings_before_response até a data da resposta.', meetingsData, ['0', '1–2', '3–5', '6+'])}
        <div class="historico-chart-card"><div class="historico-chart-frame"><canvas id="chart-meetings"></canvas></div></div>
      </div>
      <div class="historico-charts-grid">
        ${renderBucketTable('NPS por recência da última reunião', 'Faixas com N baixo não devem guiar decisão.', recencyData, ['Nunca teve reunião', '0–30 dias', '31–60 dias', '61–90 dias', '90+ dias'])}
        <div class="historico-chart-card"><div class="historico-chart-frame"><canvas id="chart-recency"></canvas></div></div>
      </div>
    </section>

    <section class="historico-block">${renderMechanismSection(mech, analyses.nps_mecanismo)}</section>

    <section class="historico-block">
      ${renderCollapsibleSection(
        'Transferência de EP',
        'Somente trocas anteriores à resposta',
        renderBucketTable('', '', epBuckets, ['0 trocas', '1 troca', '2+ trocas'].filter((k) => epBuckets[k])),
      )}
      ${renderCollapsibleSection(
        'Contexto financeiro (PIT)',
        'Associação exploratória — não causal',
        finBuckets && Object.keys(finBuckets).length
          ? renderBucketTable('Valor acumulado pago até a resposta', 'Faixas por quartis do recorte.', finBuckets, Object.keys(finBuckets))
          : '<p class="note-muted">Dados insuficientes para faixas.</p>',
      )}
      ${renderCollapsibleSection(
        'Churn / reembolso',
        'Amostra pequena',
        `<p class="historico-insufficient">Amostra insuficiente para conclusão gerencial (${quality?.responses_with_churn_date ?? 0} respostas com data de churn confiável).</p>`,
      )}
    </section>

    <section class="historico-block">${renderOfficialTable(prepareHistoricoDisplayCycles(summary.cycles))}</section>
    <section class="historico-block">${renderClientExplorerTable(explorerRows, clientPage, PAGE_SIZE)}</section>
    ${renderQualityFooter(paymentAudit, quality, updatedLabel)}
  </div>`;

  bindCharts(
    { ...summary, cycles: prepareHistoricoDisplayCycles(summary.cycles) },
    filteredSummary,
    meta,
    safraEntrada,
    safraNps,
    tenureData,
    meetingsData,
    recencyData,
  );
  bindPage(root, { enrichedAll, cohorts });
}

function renderRecurrenceInner(meta) {
  return `<div class="historico-chart-card__head"><h3 class="historico-chart-card__title">Frequência de respostas</h3></div>
    <div class="historico-chart-frame historico-chart-frame--compact"><canvas id="chart-hist-recurrence"></canvas></div>`;
}

function renderParticipation(meta) {
  const r = meta?.recurrence ?? {};
  const total = (r.once ?? 0) + (r.twice ?? 0) + (r.three_plus ?? 0);
  const pct = (n) => (total ? formatPct((100 * n) / total) : '—');
  return `<ul class="historico-participation-list">
    <li>1 vez: <strong>${r.once ?? 0}</strong> (${pct(r.once)})</li>
    <li>2 vezes: <strong>${r.twice ?? 0}</strong> (${pct(r.twice)})</li>
    <li>3+: <strong>${r.three_plus ?? 0}</strong> (${pct(r.three_plus)})</li>
  </ul>`;
}
