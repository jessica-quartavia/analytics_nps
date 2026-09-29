import {
  getNpsMilestonesSummary,
  getNpsClientMilestones,
  getNpsMilestonesQa,
  hasNpsMilestones,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import {
  filterMilestoneEntries,
  buildLiveMilestoneMatrix,
} from '../data/milestones-view.mjs';
import {
  openMilestonesDrawer,
  closeMilestonesDrawer,
  milestoneClientRowsFromEntries,
} from '../ui/milestones-drawer.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatPct } from '../utils/format.js';
import { sectionHead, helpTip } from '../ui/help.js';
import { marcoCellHtml } from '../ui/analytics-table.mjs';
import { filterMilestoneEntriesByClients, qualityLabelFriendly } from '../data/jornada-perfil-view.mjs';
import { categoryDenomsFromContext } from '../filters/filter-context.mjs';

const CATS = ['Promotor', 'Neutro', 'Detrator'];

const MARCO_TIPS = {
  has_mechanism: 'Cliente com ao menos um mecanismo implementado até a data da resposta.',
  mechanisms_2plus: 'Dois ou mais mecanismos implementados antes da resposta.',
  ever_ep: 'Cliente que já trocou de EP alguma vez antes da resposta.',
  ep_since: 'Trocou de EP desde a resposta anterior (base pareada).',
  frozen: 'Indicador baseado no status disponível no snapshot atual.',
  churn: 'Pedido de churn registrado antes da resposta.',
  app: 'Acesso ao App PHARUS conforme snapshot disponível.',
  meetings_mean: 'Média de reuniões até a resposta (point-in-time quando disponível).',
};

function coverageNote(qa, meta) {
  const cov = meta?.coverage_by_field ?? qa?.coverage_by_field ?? {};
  const low = Object.entries(cov).filter(([, v]) => v.point_in_time_pct < 30);
  if (!low.length) return '';
  return `<p class="note-muted" role="note">Cobertura temporal baixa em: ${escapeHtml(low.map(([k]) => k).join(', '))}.</p>`;
}

function renderMatrixTable(matrix, cycleCode, categoryDenoms) {
  if (!matrix?.length) return '<p class="placeholder-note">Matriz indisponível.</p>';
  let html = `<div class="table-scroll"><table class="gd-table milestone-matrix-table jornada-marcos-table analytic-table" data-cycle="${escapeAttr(cycleCode)}">
    <thead><tr><th class="col-label col-marco-label">Marco</th>${CATS.map((c) => `<th class="num col-number col-marco-cat">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>`;
  for (const row of matrix) {
    const tip = MARCO_TIPS[row.milestone_key] ?? row.label;
    if (row.milestone_key === 'meetings_mean') {
      html += `<tr><th scope="row">${helpTip(row.label, tip)}</th>`;
      for (const cat of CATS) {
        const cell = row.categories?.[cat] ?? {};
        const v = cell.value;
        const nValid = cell.nValid ?? 0;
        const denom = categoryDenoms?.[cat];
        const cov =
          denom != null && nValid < denom
            ? `<span class="cell-stack__meta">n=${nValid}${denom ? ` · cobertura ${nValid}/${denom}` : ''}</span>`
            : `<span class="cell-stack__meta">n=${nValid}</span>`;
        html += `<td class="num cell-stack"><span class="cell-stack__primary">${v == null ? '—' : escapeHtml(v.toFixed(1))}</span>${cov}</td>`;
      }
      html += '</tr>';
      continue;
    }
    html += `<tr><th scope="row">${helpTip(row.label, tip)}</th>`;
    for (const cat of CATS) {
      const cell = row.categories?.[cat] ?? {};
      const denom = categoryDenoms?.[cat] ?? null;
      const pct =
        denom && cell.n != null && denom > 0 ? (cell.n / denom) * 100 : cell.pct;
      html += marcoCellHtml(
        pct,
        cell.n,
        `data-milestone="${escapeAttr(row.milestone_key)}" data-category="${escapeAttr(cat)}"`,
        denom,
      );
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  html += `<div class="jornada-marcos-cards">${renderMarcosCards(matrix)}</div>`;
  return html;
}

function renderMarcosCards(matrix) {
  let cards = '';
  for (const row of matrix.slice(0, 6)) {
    cards += `<article class="card card--flat jornada-marco-card"><h4>${escapeHtml(row.label)}</h4><ul>`;
    for (const cat of CATS) {
      const cell = row.categories?.[cat] ?? {};
      cards += `<li>${escapeHtml(cat)}: ${cell.pct != null ? formatPct(cell.pct, 0) : '—'} (n=${cell.n ?? 0})</li>`;
    }
    cards += '</ul></article>';
  }
  return cards;
}

export function milestonePredicate(key) {
  const map = {
    has_mechanism: (r) => r.has_mechanism_before_response === true,
    mechanisms_2plus: (r) => (r.mechanisms_count_before_response ?? 0) >= 2,
    ever_ep: (r) => r.ever_changed_ep_before_response === true,
    ep_since: (r) => r.changed_ep_since_previous_response === true,
    frozen: (r) => r.frozen_at_response === true,
    churn: (r) => r.churn_requested_before_response === true,
    app: (r) => r.app_pharus_access === true,
  };
  return map[key] ?? (() => true);
}

export function renderJornadaMarcosSection(filterCtx) {
  if (!hasNpsMilestones()) {
    return `<div class="section-head"><h2 class="section-title">Marcos da jornada</h2><p class="placeholder-note">Execute <code>npm run generate:nps-milestones</code>.</p></div>`;
  }
  const filters = getFilters();
  const cycleCode = filters.cycleCode;
  const qa = getNpsMilestonesQa();
  const summary = getNpsMilestonesSummary();
  const meta = summary?.meta ?? {};
  const allEntries = getNpsClientMilestones();
  const clientSet = new Set((filterCtx?.rowsCurrent ?? []).map((r) => r.client_id));
  const recorte = clientSet.size > 0 && filterCtx?.recorteActive;
  let entries = recorte
    ? filterMilestoneEntries(allEntries, cycleCode, clientSet)
    : filterMilestoneEntries(allEntries, cycleCode, null);

  if (filters.category) {
    entries = entries.filter((e) => e.nps_category === filters.category);
  }

  const { milestone_matrix: matrix } = buildLiveMilestoneMatrix(entries, cycleCode);
  const categoryDenoms = categoryDenomsFromContext(filterCtx);

  const mechCov = meta?.coverage_by_field?.mechanisms;
  const covBadge = mechCov
    ? `<span class="badge badge--muted">${escapeHtml(qualityLabelFriendly(mechCov.point_in_time_pct >= 80 ? 'good' : 'partial'))}</span>`
    : '';

  return `
    <section id="jornada-marcos" class="jornada-section">
    ${sectionHead(
      'Marcos da jornada por classificação NPS',
      'Promotores · Neutros · Detratores',
      'As comparações mostram associações observadas nos dados. Não representam relação causal.',
    )}
    ${recorte ? '<p class="filter-recorte-banner" role="status"><strong>Recorte ativo</strong> — matriz recalculada para os clientes filtrados.</p>' : ''}
    ${coverageNote(qa, meta)}
    ${covBadge}
    ${renderMatrixTable(matrix, cycleCode, categoryDenoms)}
    </section>`;
}

export function bindJornadaMarcos(root, filterCtx, signal) {
  const opts = signal ? { signal } : undefined;
  const filters = getFilters();
  const cycleCode = filters.cycleCode;
  const allEntries = getNpsClientMilestones();
  const clientSet = new Set((filterCtx?.rowsCurrent ?? []).map((r) => r.client_id));
  let entries = filterMilestoneEntries(
    allEntries,
    cycleCode,
    filterCtx?.recorteActive ? clientSet : null,
  );
  if (filters.category) entries = entries.filter((e) => e.nps_category === filters.category);

  root.querySelectorAll('.milestone-drill').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => {
        const cat = btn.dataset.category;
        const key = btn.dataset.milestone;
        const pred = milestonePredicate(key);
        openMilestonesDrawer({
          title: `${btn.closest('tr')?.querySelector('th')?.textContent ?? key} — ${cat}`,
          subtitle: `Ciclo ${cycleCode}`,
          rows: milestoneClientRowsFromEntries(
            entries.filter((e) => e.nps_category === cat),
            pred,
          ),
        });
      },
      opts,
    );
  });

  if (signal) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMilestonesDrawer();
    }, { signal });
  }
}
