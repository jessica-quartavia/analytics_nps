import { getNpsManagementInsights, hasNpsManagementInsights } from '../data/analytics-store.js';
import { escapeHtml } from '../utils/escape-html.js';
import { sectionHead } from '../ui/help.js';

export function renderExecutivoManagementInsightsSection() {
  if (!hasNpsManagementInsights()) return '';
  const doc = getNpsManagementInsights();
  const cards = (doc?.executive_cards ?? []).slice(0, 4);

  function cardHref(c) {
    if (c.card_id === 'exec_resultados_mechanisms') {
      return '#/jornada-perfil?tema=Resultados&valencia=Negativa#jornada-temas';
    }
    if (c.card_id === 'exec_tier_not_explanation') {
      return '#/jornada-perfil#jornada-financial';
    }
    const anchor = c.analysis_anchor ? `#${c.analysis_anchor}` : '';
    return `#/${c.analysis_route}${anchor}`;
  }

  const cardHtml = cards
    .map(
      (c) => `
    <article class="card exec-evidence-card">
      <h3 class="exec-evidence-card__title">${escapeHtml(c.title)}</h3>
      <p class="exec-evidence-card__text">${escapeHtml(c.statement)}</p>
      <a class="btn btn--secondary btn--sm" href="${cardHref(c)}">Ver análise</a>
    </article>`,
    )
    .join('');

  return `
    ${sectionHead(
      'O que os dados sustentam',
      'Set/2026 PHARUS — consolidação 4.3–4.7',
      'Leitura gerencial sem p-valores nesta seção. Detalhes estatísticos ficam em Movimento (mudança) ou Drivers.',
    )}
    <div class="grid grid--2 exec-evidence-grid">${cardHtml}</div>
  `;
}
