import { escapeHtml } from '../utils/escape-html.js';

/**
 * @param {string} label
 * @param {string} valueHtml — já formatado (números); não incluir HTML não confiável
 * @param {string} [note]
 * @param {{ highlight?: boolean, compact?: boolean, featured?: boolean, tone?: 'promoter'|'passive'|'detractor' }} [options]
 */
export function kpiCard(label, valueHtml, note, options = {}) {
  const classes = ['kpi-card'];
  if (options.highlight) classes.push('kpi-card-highlight');
  if (options.compact) classes.push('kpi-card-compact');
  if (options.featured) classes.push('kpi-card-featured');
  if (options.tone === 'promoter') classes.push('kpi-card--promoter');
  if (options.tone === 'passive') classes.push('kpi-card--passive');
  if (options.tone === 'detractor') classes.push('kpi-card--detractor');
  return `<article class="${classes.join(' ')}">
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value">${valueHtml}</div>
    ${note ? `<div class="kpi-note">${escapeHtml(note)}</div>` : ''}
  </article>`;
}
