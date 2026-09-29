import { getNpsChangeDrivers, hasNpsChangeDrivers } from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import { filterMilestoneEntries } from '../data/milestones-view.mjs';
import { getNpsClientMilestones, hasNpsMilestones } from '../data/analytics-store.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatNps, formatPct } from '../utils/format.js';
import { sectionHead, helpTip } from '../ui/help.js';
import { mechanismBucket, npsFromScores, qualityLabelFriendly } from '../data/jornada-perfil-view.mjs';
import { cellClients, cellNpsStack, cellPlainNum, cellPctStack } from '../ui/analytics-table.mjs';

const CATS = ['Promotor', 'Neutro', 'Detrator'];

function distribByBucket(entries) {
  const buckets = ['0', '1', '2+'];
  return Object.fromEntries(
    buckets.map((b) => {
      const rows = entries.filter((e) => mechanismBucket(e.mechanisms_count_before_response) === b);
      return [
        b,
        {
          n: rows.length,
          nps: npsFromScores(rows.map((r) => r.score)),
          mean_score: rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : null,
        },
      ];
    }),
  );
}

function mechColLabel(b) {
  if (b === '0') return '0 mecanismos';
  if (b === '1') return '1 mecanismo';
  return '2+ mecanismos';
}

export function renderJornadaMechanismsSection(filterCtx) {
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

  const withMechInfo = entries.filter((e) => mechanismBucket(e.mechanisms_count_before_response) != null);
  const popTotal = filterCtx?.officialSummary?.valid_responses ?? entries.length;

  const byBucket = distribByBucket(withMechInfo);
  const drivers = hasNpsChangeDrivers() ? getNpsChangeDrivers() : null;
  const cov = drivers?.coverage?.fields?.mechanisms_before_response;
  const covLabel = cov ? qualityLabelFriendly(cov.quality) : '—';

  let catRows = '';
  for (const cat of CATS) {
    const catEntries = entries.filter((e) => e.nps_category === cat);
    const validCat = catEntries.filter((e) => mechanismBucket(e.mechanisms_count_before_response) != null);
    const denom = validCat.length;
    catRows += `<tr><th scope="row" class="col-label">${escapeHtml(cat)}</th>`;
    for (const b of ['0', '1', '2+']) {
      const nIn = validCat.filter((e) => mechanismBucket(e.mechanisms_count_before_response) === b).length;
      const pct = denom ? (nIn / denom) * 100 : null;
      catRows += cellPctStack(pct, nIn);
    }
    catRows += '</tr>';
  }

  const validByCatNote = CATS.map(
    (cat) => {
      const n = entries.filter(
        (e) => e.nps_category === cat && mechanismBucket(e.mechanisms_count_before_response) != null,
      ).length;
      return `${cat}: n=${n}`;
    },
  ).join(' · ');

  let npsRows = '';
  for (const b of ['0', '1', '2+']) {
    const s = byBucket[b];
    npsRows += `<tr><th scope="row" class="col-label col-mech-label">${escapeHtml(mechColLabel(b))}</th>`;
    npsRows += cellClients(s?.n ?? 0);
    npsRows += cellNpsStack(s?.nps, null, null);
    npsRows += cellPlainNum(s?.mean_score, 1);
    npsRows += '</tr>';
  }

  const bucketSum = (byBucket['0']?.n ?? 0) + (byBucket['1']?.n ?? 0) + (byBucket['2+']?.n ?? 0);

  return `
    <section id="jornada-mecanismos" class="jornada-section">
    ${sectionHead('Mecanismos × NPS', `Cobertura: ${escapeHtml(covLabel)}`, 'Associação observada — não causalidade. Dados point-in-time quando disponíveis.')}
    <p class="note-muted">Cobertura de mecanismos: ${withMechInfo.length} de ${popTotal} clientes com informação válida (soma das faixas: ${bucketSum}).</p>
    ${filterCtx?.recorteActive ? '<p class="filter-recorte-banner" role="status"><strong>Recorte ativo</strong> — agregados recalculados para clientes filtrados.</p>' : ''}
    <div class="grid grid--2">
      <article class="card"><h3>NPS por faixa de mecanismos</h3>
        <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table analytic-table--mech-nps"><thead><tr><th class="col-label col-mech-label">Faixa</th><th class="num col-number col-mech-num">Clientes</th><th class="num col-number col-mech-num">NPS</th><th class="num col-number col-mech-num">Nota média</th></tr></thead><tbody>${npsRows}</tbody></table></div>
      </article>
      <article class="card"><h3>Distribuição por categoria NPS</h3>
        ${helpTip(
          'Denominador',
          'Percentual calculado dentro de cada categoria NPS, considerando clientes com informação válida de mecanismos.',
        )}
        <p class="note-muted">${escapeHtml(validByCatNote)}</p>
        <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table"><thead><tr><th class="col-label">Categoria</th><th class="num col-percent col-category">0 mecanismos</th><th class="num col-percent col-category">1 mecanismo</th><th class="num col-percent col-category">2+ mecanismos</th></tr></thead><tbody>${catRows}</tbody></table></div>
      </article>
    </div>
    </section>`;
}
