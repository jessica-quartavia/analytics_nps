import {
  getDriversSummary,
  getDriverTests,
  getCommentDrivers,
  getCycleSummary,
  getCycles,
  getDataState,
  hasDriversArtifacts,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import { formatNps, formatPct, formatDate, cycleStatusLabel } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { sectionHead, TIPS } from '../ui/help.js';
import { methodologyOpenButton } from '../ui/methodology-drawer.js';
import { drawerShell } from '../ui/drawer-layout.mjs';
import {
  driverFriendlyName,
  qualityFriendlyLabel,
  qualityBadgeClass,
  formatPAdjusted,
  formatEffectLabel,
  partitionDriverTests,
  driverInterpretation,
} from '../data/drivers-view.mjs';

let tableState = { filterOutcome: '', filterSig: '' };

function renderHero(cycle, summary) {
  const dataState = getDataState();
  const cutoff = formatDate(summary?.data_cutoff ?? dataState?.dataCutoff);
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Drivers</p>
        <h1 class="hero__title">Drivers do NPS</h1>
        <p class="page-header__lead">Fatores associados às notas — relação observada, não causalidade.</p>
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
  const { ranking } = partitionDriverTests(tests);
  return `
    <div class="metric-compact-grid">
      <article class="metric-compact"><div class="metric-compact__label">Drivers testados</div><div class="metric-compact__value">${summary?.tests_count ?? tests.length}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Associações utilizáveis</div><div class="metric-compact__value">${ranking.length}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Significativos (FDR)</div><div class="metric-compact__value">${summary?.significant_fdr_count ?? 0}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Cobertura média</div><div class="metric-compact__value">${escapeHtml(formatPct((summary?.average_feature_coverage ?? 0) * 100, 0))}</div></article>
    </div>`;
}

function applyTableFilters(tests) {
  let out = [...tests];
  if (tableState.filterOutcome) out = out.filter((t) => t.outcome === tableState.filterOutcome);
  if (tableState.filterSig === 'yes') out = out.filter((t) => t.significant_fdr_05);
  if (tableState.filterSig === 'no') out = out.filter((t) => !t.significant_fdr_05);
  return out;
}

function renderDriverRow(t) {
  const key = `${t.driver}-${t.outcome}-${t.universe}`;
  const qLabel = qualityFriendlyLabel(t.feature_quality);
  const qCls = qualityBadgeClass(t.feature_quality);
  const effectStack =
    t.effect_size != null
      ? `<span class="cell-stack__primary">${t.effect_size.toFixed(2).replace('.', ',')}</span><span class="cell-stack__meta">${escapeHtml(formatEffectLabel(t.effect_label))}</span>`
      : '—';
  const evidence = t.significant_fdr_05 ? 'Sustentada' : 'Exploratória';
  return `<tr class="driver-row" data-driver-key="${escapeAttr(key)}" tabindex="0">
    <td>${escapeHtml(driverFriendlyName(t.driver))}</td>
    <td>${escapeHtml(t.outcome)} <span class="note-muted">(${escapeHtml(t.universe)})</span></td>
    <td class="num cell-stack">${effectStack}</td>
    <td class="num">${t.n ?? '—'}</td>
    <td>${escapeHtml(evidence)}</td>
    <td><span class="badge ${qCls}">${escapeHtml(qLabel)}</span></td>
    <td><button type="button" class="btn btn--ghost btn--sm driver-open-detail" data-driver-key="${escapeAttr(key)}">Detalhe</button></td>
  </tr>`;
}

function renderDriversSection(title, tests, emptyMsg) {
  const rows = applyTableFilters(tests);
  if (!rows.length) return `<h3 class="section-subtitle">${escapeHtml(title)}</h3><p class="note-muted">${escapeHtml(emptyMsg)}</p>`;
  return `
    <h3 class="section-subtitle">${escapeHtml(title)}</h3>
    <div class="table-scroll">
      <table class="data-table data-table--drivers">
        <thead><tr>
          <th scope="col">Fator</th><th scope="col">Relação</th><th class="num" scope="col">Efeito</th>
          <th class="num" scope="col">Amostra</th><th scope="col">Evidência</th><th scope="col">Qualidade</th><th scope="col">Ação</th>
        </tr></thead>
        <tbody>${rows.slice(0, 40).map(renderDriverRow).join('')}</tbody>
      </table>
    </div>`;
}

function renderCommentDriversTable(cycleCode) {
  const rows = getCommentDrivers(cycleCode)
    .sort((a, b) => Math.abs(b.delta_nps ?? 0) - Math.abs(a.delta_nps ?? 0))
    .slice(0, 30);
  if (!rows.length) return '<p class="note-muted">Sem testes de tema para este ciclo.</p>';
  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          <th>Tema</th><th>Valência</th><th class="num">NPS com</th><th class="num">NPS sem</th>
          <th class="num">Delta</th><th class="num">Amostra</th><th>Evidência</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
              <td>${escapeHtml(r.topic)}</td>
              <td>${escapeHtml(r.valence)}</td>
              <td class="num">${r.nps_with != null ? formatNps(r.nps_with) : '—'}</td>
              <td class="num">${r.nps_without != null ? formatNps(r.nps_without) : '—'}</td>
              <td class="num">${r.delta_nps != null ? formatNps(r.delta_nps) : '—'}</td>
              <td class="num">${r.n ?? '—'}</td>
              <td>${r.p_value_adjusted != null ? escapeHtml(formatPAdjusted(r.p_value_adjusted)) : '—'}</td>
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
        <li>Variáveis com qualidade <strong>Indisponível</strong> não entram no ranking principal.</li>
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
  const unavailable = test.feature_quality === 'unavailable';
  drawer.innerHTML = drawerShell({
    title: driverFriendlyName(test.driver),
    closeId: 'driver-drawer-close',
    bodyHtml: `
      ${unavailable ? '<p class="quality-box" role="note">Este resultado não deve ser usado como evidência gerencial, pois a qualidade da variável está marcada como indisponível.</p>' : ''}
      <p class="note-muted"><strong>Variável técnica:</strong> ${escapeHtml(test.driver)}</p>
      <div class="drawer-meta">
        <div class="drawer-meta__item"><span class="drawer-meta__label">Outcome</span><span class="drawer-meta__value">${escapeHtml(test.outcome)}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Método</span><span class="drawer-meta__value">${escapeHtml(String(test.method ?? '—'))}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Amostra</span><span class="drawer-meta__value">${test.n ?? '—'}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Efeito</span><span class="drawer-meta__value">${test.effect_size?.toFixed(3) ?? '—'}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Classificação</span><span class="drawer-meta__value">${escapeHtml(formatEffectLabel(test.effect_label))}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Qualidade</span><span class="drawer-meta__value">${escapeHtml(qualityFriendlyLabel(test.feature_quality))}</span></div>
      </div>
      <p><strong>p ajustado:</strong> ${test.p_value_adjusted?.toExponential(6) ?? '—'}</p>
      <p><strong>IC95:</strong> ${test.ci_low != null ? test.ci_low.toFixed(3) : '—'} – ${test.ci_high != null ? test.ci_high.toFixed(3) : '—'}</p>
      <p>${escapeHtml(driverInterpretation(test))}</p>
      <p class="note-muted">${escapeHtml((test.limitations ?? []).join('; ') || (test.reading_hint ?? ''))}</p>`,
  });
  drawer.classList.add('drawer--wide');
  backdrop?.classList.add('is-open');
  drawer.classList.add('is-open');
  drawer.querySelector('#driver-drawer-close')?.addEventListener('click', closeDriverDrawer);
  backdrop?.addEventListener('click', closeDriverDrawer, { once: true });
}

function bind(host, tests, signal) {
  host.querySelector('#drivers-filter-outcome')?.addEventListener(
    'change',
    (e) => {
      tableState.filterOutcome = e.target.value;
      renderDrivers(host, { signal });
    },
    { signal },
  );
  host.querySelector('#drivers-filter-sig')?.addEventListener(
    'change',
    (e) => {
      tableState.filterSig = e.target.value;
      renderDrivers(host, { signal });
    },
    { signal },
  );
  host.querySelectorAll('.driver-row, .driver-open-detail').forEach((el) => {
    const open = () => {
      const key = el.dataset.driverKey;
      const test = tests.find((t) => `${t.driver}-${t.outcome}-${t.universe}` === key);
      openDriverDrawer(test);
    };
    el.addEventListener('click', (e) => {
      if (e.target.closest('.driver-open-detail') || el.classList.contains('driver-row')) open();
    }, { signal });
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
  const { ranking, caveat, insufficient } = partitionDriverTests(tests);
  const cycle = getCycles().find((c) => c.cycle_code === cycleCode);
  const cycleSummary = getCycleSummary(cycleCode);

  host.innerHTML = `
    ${renderHero(cycle, cycleSummary)}
    ${renderKpis(summary, cycleCode)}
    <section class="section-block">
      ${sectionHead('Associações estatísticas', null, TIPS.drivers)}
      <p class="methodology-inline-link">${methodologyOpenButton('drivers', 'Ver metodologia — Drivers')}</p>
      <div class="section-block__head">
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
      ${renderDriversSection('Associações utilizáveis', ranking, 'Nenhuma associação com qualidade adequada para ranking principal.')}
      ${renderDriversSection('Associações com ressalva', caveat, 'Nenhuma associação com proxy parcial neste recorte.')}
      ${renderDriversSection('Dados insuficientes / não utilizáveis', insufficient, 'Nenhum driver marcado como indisponível neste recorte.')}
    </section>
    <section class="section-block">
      <h2 class="section-title">Temas associados à satisfação</h2>
      ${renderCommentDriversTable(cycleCode)}
    </section>
    ${renderInterpretation(summary)}
  `;
  bind(host, tests, signal);
}
