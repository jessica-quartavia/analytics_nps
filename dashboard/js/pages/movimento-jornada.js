import { getNpsBetweenCycleEvents, hasNpsMilestones } from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import {
  filterBetweenEvents,
  migrationComparisonFromEvents,
} from '../data/milestones-view.mjs';
import {
  openMilestonesDrawer,
  closeMilestonesDrawer,
  milestoneClientRowsFromBetween,
} from '../ui/milestones-drawer.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatPct } from '../utils/format.js';
import { sectionHead } from '../ui/help.js';
import { renderMovimentoChangeDriversSection, bindMovimentoChangeDrivers } from './movimento-change-drivers.js';

function renderComparisonCard(comp, labelA, labelB) {
  const small = comp.n_a < 5 || comp.n_b < 5;
  return `
    <article class="card milestone-compare-card">
      <h3>${escapeHtml(labelA)} <span class="note-muted">vs</span> ${escapeHtml(labelB)}</h3>
      ${small ? '<span class="badge badge--method">Amostra pequena</span>' : ''}
      <p class="note-muted">Associação observada entre ciclos — sem inferência causal.</p>
      <ul class="milestone-compare-list">
        <li><strong>Troca de EP:</strong> ${escapeHtml(formatPct(comp.pct_ep_a, 1))} (${comp.n_a}) vs ${escapeHtml(formatPct(comp.pct_ep_b, 1))} (${comp.n_b})
          <button type="button" class="link-button milestone-drill-between" data-side="a" data-migration="${escapeAttr(labelA)}">Ver ${escapeHtml(labelA)}</button>
          <button type="button" class="link-button milestone-drill-between" data-side="b" data-migration="${escapeAttr(labelB)}">Ver ${escapeHtml(labelB)}</button>
        </li>
      </ul>
    </article>`;
}

export function renderMovimentoBetweenCyclesSection(filterCtx) {
  if (!hasNpsMilestones()) {
    return `<div class="section-head"><h2 class="section-title">Entre ciclos</h2><p class="placeholder-note">Execute <code>npm run generate:nps-milestones</code> após o refresh.</p></div>`;
  }

  const filters = getFilters();
  const cycleCode = filters.cycleCode;
  const clientSet = new Set((filterCtx?.rowsCurrent ?? []).map((r) => r.client_id));
  const betweenAll = getNpsBetweenCycleEvents();
  let between = filterBetweenEvents(betweenAll, clientSet, filters.base === 'paired');
  if (filters.base === 'paired' || filterCtx?.recorteActive) {
    between = between.filter((e) => e.current_cycle === cycleCode);
  }

  const ppn = migrationComparisonFromEvents(between, 'Promotor → Neutro', 'Promotor → Promotor');
  const ppd = migrationComparisonFromEvents(between, 'Promotor → Detrator', 'Promotor → Promotor');
  const npn = migrationComparisonFromEvents(between, 'Neutro → Promotor', 'Neutro → Neutro');
  const ndn = migrationComparisonFromEvents(between, 'Neutro → Detrator', 'Neutro → Neutro');

  return `
    <div id="movimento-between-cycles">
    ${sectionHead(
      'O que aconteceu entre os ciclos?',
      'Base pareada — eventos entre respostas consecutivas',
      'Reuniões, mecanismos implementados, troca de EP, congelamento e churn observados entre respostas. Perfil estático por categoria está em Jornada & Perfil.',
    )}
    ${filters.base !== 'paired' ? '<p class="note-muted">Selecione <strong>Base pareada</strong> nos filtros para alinhar a população entre ciclos.</p>' : ''}
    <div class="metric-compact-grid">
      <article class="metric-compact"><div class="metric-compact__label">Transições no recorte</div><div class="metric-compact__value">${between.length}</div></article>
    </div>
    <div class="grid grid--2">
      ${renderComparisonCard(ppn, 'Promotor → Neutro', 'Promotor → Promotor')}
      ${renderComparisonCard(ppd, 'Promotor → Detrator', 'Promotor → Promotor')}
      ${renderComparisonCard(npn, 'Neutro → Promotor', 'Neutro → Neutro')}
      ${renderComparisonCard(ndn, 'Neutro → Detrator', 'Neutro → Neutro')}
    </div>
    ${renderMovimentoChangeDriversSection()}
    </div>
  `;
}

export function bindMovimentoBetweenCycles(root, filterCtx, signal) {
  bindMovimentoChangeDrivers();
  const opts = signal ? { signal } : undefined;
  const filters = getFilters();
  const cycleCode = filters.cycleCode;
  const clientSet = new Set((filterCtx?.rowsCurrent ?? []).map((r) => r.client_id));
  const betweenAll = getNpsBetweenCycleEvents();
  let between = filterBetweenEvents(betweenAll, clientSet, filters.base === 'paired');
  between = between.filter((e) => e.current_cycle === cycleCode);

  root.querySelectorAll('.milestone-drill-between').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => {
        const mig = btn.dataset.migration;
        const norm = (m) => (m ?? '').replace(/\s->\s/g, ' → ');
        const rows = between.filter((e) => norm(e.migration) === norm(mig));
        openMilestonesDrawer({
          title: mig,
          subtitle: 'Clientes na transição (pareados)',
          rows: milestoneClientRowsFromBetween(rows, () => true),
        });
      },
      opts,
    );
  });

  if (signal) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') closeMilestonesDrawer();
      },
      { signal },
    );
  }
}

/** @deprecated use renderMovimentoBetweenCyclesSection */
export const renderMovimentoJornadaSection = renderMovimentoBetweenCyclesSection;
/** @deprecated use bindMovimentoBetweenCycles */
export const bindMovimentoJornada = bindMovimentoBetweenCycles;
