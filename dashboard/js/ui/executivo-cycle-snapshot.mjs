import { escapeAttr } from '../utils/escape-html.js';
import { helpTip } from './help.js';

/** Registro histórico fixo — não entra no cálculo do NPS atual do dashboard. */
export const EXECUTIVO_NPS_CLOSED_2026_10_01 = {
  dateLabel: '01/10/2026',
  nps: 65,
  tooltip:
    'Valor registrado no fechamento do NPS em 01/10/2026. Não substitui o NPS atual do dashboard.',
};

export function renderExecutivoHistoricalNpsClosedKpi() {
  const { dateLabel, nps, tooltip } = EXECUTIVO_NPS_CLOSED_2026_10_01;
  const title = `NPS fechado em ${dateLabel}`;
  return `
    <article class="metric-hero metric-hero--historical" title="${escapeAttr(tooltip)}" aria-label="${escapeAttr(title)}">
      <div class="metric-hero__label">${helpTip(title, tooltip)}</div>
      <div class="metric-hero__value">${nps}</div>
      <div class="metric-hero__note">Registro histórico do fechamento em ${dateLabel}</div>
    </article>`;
}

/** @deprecated use renderExecutivoHistoricalNpsClosedKpi */
export function renderExecutivoCycleSnapshot() {
  return renderExecutivoHistoricalNpsClosedKpi();
}
