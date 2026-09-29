import { getNpsClientMilestones, hasNpsMilestones } from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import { filterMilestoneEntries } from '../data/milestones-view.mjs';
import { escapeHtml } from '../utils/escape-html.js';
import { formatPct } from '../utils/format.js';
import { tdNumericStack } from '../ui/analytics-table.mjs';
import { sectionHead } from '../ui/help.js';

const CATS = ['Promotor', 'Neutro', 'Detrator'];

export function renderJornadaStageSection(filterCtx) {
  if (!hasNpsMilestones()) return '';

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

  const stages = [...new Set(entries.map((e) => e.journey_stage).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
  if (!stages.length) stages.push('(sem etapa)');

  let rows = '';
  for (const stage of stages) {
    rows += `<tr><th scope="row" class="col-label col-journey-stage">${escapeHtml(stage)}</th>`;
    for (const cat of CATS) {
      const bucket = entries.filter((e) => e.nps_category === cat);
      const n =
        stage === '(sem etapa)'
          ? bucket.filter((e) => !e.journey_stage).length
          : bucket.filter((e) => e.journey_stage === stage).length;
      const pct = bucket.length ? (n / bucket.length) * 100 : null;
      rows += tdNumericStack(n, pct != null ? formatPct(pct, 0) : '—', 'num col-number col-percent');
    }
    rows += '</tr>';
  }

  return `
    <section id="jornada-etapa" class="jornada-section">
    ${sectionHead(
      'Etapa da jornada × NPS',
      'Onde estão Promotores, Neutros e Detratores na jornada?',
      'Representa a etapa disponível no snapshot atual e não necessariamente a etapa exata na data da resposta NPS.',
    )}
    ${filterCtx?.recorteActive ? '<p class="filter-recorte-banner" role="status"><strong>Recorte ativo</strong> — distribuição recalculada para clientes filtrados.</p>' : ''}
    <p class="note-muted"><span class="badge badge--warn" title="Representa a etapa disponível no snapshot atual e não necessariamente a etapa exata na data da resposta NPS.">Etapa atual</span></p>
    <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table jornada-journey-table"><colgroup>
      <col style="width:34%" /><col style="width:22%" /><col style="width:22%" /><col style="width:22%" />
    </colgroup><thead><tr>
      <th scope="col" class="col-label col-journey-stage">Etapa</th>
      ${CATS.map((c) => `<th scope="col" class="num col-number col-journey-cat">${escapeHtml(c)}</th>`).join('')}
    </tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
}
