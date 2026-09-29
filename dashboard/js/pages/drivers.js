import {
  getDriversSummary,
  getDriverTests,
  getCommentDrivers,
  getCycleSummary,
  getCycles,
  getDataState,
  hasDriversArtifacts,
} from '../data/analytics-store.js';
import { getFilters, setFilter } from '../filters/global-filters.js';
import { formatNps, formatPct, formatDate, cycleStatusLabel } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { sectionHead, TIPS, helpTip } from '../ui/help.js';

let tableState = { sortKey: 'relevance_score', filterOutcome: '', filterSig: '', filterQuality: '' };

function renderHero(cycle, summary) {
  const dataState = getDataState();
  const cutoff = formatDate(summary?.data_cutoff ?? dataState?.dataCutoff);
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Drivers</p>
        <h1 class="hero__title">Drivers do NPS</h1>
        <p class="page-header__lead">Mostra fatores associados às notas. Não significa causa, e sim relação observada na base.</p>
      </div>
      <div class="chip-row">
        <span class="chip-modern">${escapeHtml(cycle?.cycle_name ?? '—')}</span>
        <span class="chip-modern">${escapeHtml(cycleStatusLabel(summary?.status))}</span>
        <span class="chip-modern">Atualizado ${escapeHtml(cutoff)}</span>
      </div>
    </header>`;
}

function renderKpis(summary, cycleCode) {
  const tests = getDriverTests(cycleCode);
  return `
    <div class="metric-compact-grid">
      <article class="metric-compact"><div class="metric-compact__label">Drivers testados</div><div class="metric-compact__value">${summary?.tests_count ?? tests.length}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Associações relevantes (FDR)</div><div class="metric-compact__value">${summary?.significant_fdr_count ?? 0}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Base analisada</div><div class="metric-compact__value">${escapeHtml(cycleCode?.slice(-8) ?? '—')}</div><div class="metric-compact__note">Ciclo selecionado</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Cobertura média features</div><div class="metric-compact__value">${escapeHtml(formatPct((summary?.average_feature_coverage ?? 0) * 100, 0))}</div></article>
    </div>`;
}

function filterTests(tests) {
  let out = [...tests];
  if (tableState.filterOutcome) out = out.filter((t) => t.outcome === tableState.filterOutcome);
  if (tableState.filterSig === 'yes') out = out.filter((t) => t.significant_fdr_05);
  if (tableState.filterSig === 'no') out = out.filter((t) => !t.significant_fdr_05);
  if (tableState.filterQuality) out = out.filter((t) => t.feature_quality === tableState.filterQuality);
  out.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  return out;
}

function renderDriversTable(tests) {
  const rows = filterTests(tests).slice(0, 50);
  if (!rows.length) {
    return `<p class="quality-box">Não encontramos evidência estatística robusta após correção por múltiplos testes para os filtros atuais — isso é um resultado válido.</p>`;
  }
  const qualityBadge = (q) => {
    if (!q || q === '—') return '—';
    const cls = /high|complete/i.test(q) ? 'quality-badge quality-badge--high' : 'quality-badge';
    return `<span class="${cls}">${escapeHtml(q)}</span>`;
  };

  return `
    <div class="table-scroll">
      <table class="data-table data-table--drivers" id="drivers-table">
        <thead><tr>
          <th class="col-driver" scope="col">Driver</th>
          <th scope="col">Relação</th>
          <th class="col-method" scope="col">Método</th>
          <th class="num col-compact" scope="col">Efeito</th>
          <th class="num col-compact" scope="col">n</th>
          <th class="num col-compact" scope="col">p adj.</th>
          <th scope="col">Qualidade</th>
          <th class="col-reading" scope="col">Leitura</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (t) => `
            <tr class="driver-row" data-driver-key="${escapeAttr(`${t.driver}-${t.outcome}-${t.universe}`)}" tabindex="0">
              <td class="col-driver">${escapeHtml(t.driver)}</td>
              <td>${escapeHtml(t.outcome)} <span class="note-muted">(${escapeHtml(t.universe)})</span></td>
              <td class="col-method">${escapeHtml(t.method)}</td>
              <td class="num">${t.effect_size != null ? `<span class="effect-badge">${t.effect_size.toFixed(2)}</span>` : '—'} ${t.effect_label ? `<span class="note-muted">${escapeHtml(t.effect_label)}</span>` : ''}</td>
              <td class="num">${t.n ?? '—'}</td>
              <td class="num">${t.p_value_adjusted != null ? t.p_value_adjusted.toExponential(2) : '—'}</td>
              <td>${qualityBadge(t.feature_quality)}</td>
              <td class="col-reading">${escapeHtml(t.reading_hint ?? '—')}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function renderCommentDriversTable(cycleCode) {
  const rows = getCommentDrivers(cycleCode).sort(
    (a, b) => Math.abs(b.delta_nps ?? 0) - Math.abs(a.delta_nps ?? 0),
  ).slice(0, 30);
  if (!rows.length) return '<p class="note-muted">Sem testes de tema para este ciclo.</p>';
  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          <th>Tema</th><th>Valência</th><th class="num">NPS com</th><th class="num">NPS sem</th>
          <th class="num">Delta</th><th class="num">n</th><th class="num">p adj.</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.topic)}</td>
              <td>${escapeHtml(r.valence)}</td>
              <td class="num">${r.nps_with != null ? formatNps(r.nps_with) : '—'}</td>
              <td class="num">${r.nps_without != null ? formatNps(r.nps_without) : '—'}</td>
              <td class="num">${r.delta_nps != null ? formatNps(r.delta_nps) : '—'}</td>
              <td class="num">${r.n ?? '—'}</td>
              <td class="num">${r.p_value_adjusted != null ? r.p_value_adjusted.toExponential(2) : '—'}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <p class="note-muted">Associação observada entre menção ao tema e nota — não implica causalidade.</p>`;
}

function renderInterpretation(summary) {
  return `
    <div class="quality-box">
      <strong>Como interpretar</strong>
      <ul>
        <li>${escapeHtml(summary?.interpretation ?? 'Associação ≠ causalidade.')}</li>
        <li>Correção Benjamini-Hochberg (FDR α=${summary?.fdr_alpha ?? 0.05}).</li>
        <li>${escapeHtml(summary?.relevance_formula ?? '')}</li>
        <li>Proxies (EP atual, engajamento snapshot) reduzem qualidade temporal.</li>
        <li>Reuniões via CSAT parcial quando calendário não carregado.</li>
      </ul>
    </div>`;
}

export function closeDriverDrawer() {
  document.getElementById('driver-drawer-backdrop')?.classList.remove('is-open');
  document.getElementById('driver-drawer')?.classList.remove('is-open');
}

function openDriverDrawer(test) {
  const drawer = document.getElementById('driver-drawer');
  const backdrop = document.getElementById('driver-drawer-backdrop');
  if (!drawer || !test) return;
  drawer.innerHTML = `
    <button type="button" class="drawer__close" id="driver-drawer-close">×</button>
    <h2>${escapeHtml(test.driver)}</h2>
    <p>Outcome: ${escapeHtml(test.outcome)} · Universo: ${escapeHtml(test.universe)}</p>
    <p>Método: ${escapeHtml(test.method)} · n=${test.n}</p>
    <p>Efeito: ${test.effect_size?.toFixed(3) ?? '—'} (${escapeHtml(test.effect_label ?? '')})</p>
    <p>p bruto: ${test.p_value_raw?.toExponential(3) ?? '—'} · p ajustado: ${test.p_value_adjusted?.toExponential(3) ?? '—'}</p>
    <p>IC: ${test.ci_low != null ? test.ci_low.toFixed(3) : '—'} – ${test.ci_high != null ? test.ci_high.toFixed(3) : '—'}</p>
    <p>Qualidade feature: ${escapeHtml(test.feature_quality ?? '—')}</p>
    <p>${escapeHtml((test.limitations ?? []).join('; ') || 'Sem limitações adicionais registradas.')}</p>
    <p><em>${escapeHtml(test.reading_hint ?? '')}</em></p>
  `;
  backdrop?.classList.add('is-open');
  drawer.classList.add('is-open');
  drawer.querySelector('#driver-drawer-close')?.addEventListener('click', closeDriverDrawer);
  backdrop?.addEventListener('click', closeDriverDrawer, { once: true });
}

function bind(host, tests, signal) {
  host.querySelector('#drivers-filter-outcome')?.addEventListener('change', (e) => {
    tableState.filterOutcome = e.target.value;
    renderDrivers(host, { signal });
  }, { signal });
  host.querySelector('#drivers-filter-sig')?.addEventListener('change', (e) => {
    tableState.filterSig = e.target.value;
    renderDrivers(host, { signal });
  }, { signal });
  host.querySelectorAll('.driver-row').forEach((row) => {
    const key = row.dataset.driverKey;
    const test = tests.find((t) => `${t.driver}-${t.outcome}-${t.universe}` === key);
    row.addEventListener('click', () => openDriverDrawer(test), { signal });
  });
}

export function renderDrivers(host, { signal } = {}) {
  closeDriverDrawer();
  const filters = getFilters();
  const cycleCode = filters.cycleCode;

  if (!hasDriversArtifacts()) {
    host.innerHTML = `${renderHero(null, null)}<div class="quality-box">Artefatos de drivers ainda não gerados. Execute <code>npm run generate:drivers</code>.</div>`;
    return;
  }

  const summary = getDriversSummary();
  const tests = getDriverTests(cycleCode);
  const cycle = getCycles().find((c) => c.cycle_code === cycleCode);
  const cycleSummary = getCycleSummary(cycleCode);

  host.innerHTML = `
    ${renderHero(cycle, cycleSummary)}
    ${renderKpis(summary, cycleCode)}
    <section class="section-block">
      ${sectionHead('Ranking de associações', null, TIPS.drivers)}
      <div class="section-block__head">
        <span class="visually-hidden">Filtros</span>
        <div class="filter-inline">
          <select id="drivers-filter-outcome" class="select-input" aria-label="Outcome">
            <option value="">Todos outcomes</option>
            ${[...new Set(tests.map((t) => t.outcome))].map((o) => `<option value="${escapeAttr(o)}" ${tableState.filterOutcome === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
          </select>
          <select id="drivers-filter-sig" class="select-input" aria-label="Significância FDR">
            <option value="">Significância</option>
            <option value="yes" ${tableState.filterSig === 'yes' ? 'selected' : ''}>FDR significativo</option>
            <option value="no" ${tableState.filterSig === 'no' ? 'selected' : ''}>Não significativo</option>
          </select>
        </div>
      </div>
      ${renderDriversTable(tests)}
    </section>
    <section class="section-block">
      <h2 class="section-title">Temas associados à satisfação</h2>
      ${renderCommentDriversTable(cycleCode)}
    </section>
    ${renderInterpretation(summary)}
  `;
  bind(host, tests, signal);
}
