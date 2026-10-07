import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { helpTip } from './help.js';
import { DATA_SOURCE_CATALOG, PAGE_DATA_SOURCES } from '../data/page-data-sources.mjs';

const DB_ICON = `<svg class="data-source-notice__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><ellipse cx="12" cy="5" rx="9" ry="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

function badgeHtml(source, { pending = false } = {}) {
  if (pending) {
    return `<span class="badge badge--neutral-soft" title="Matching ou credenciais pendentes">App PHARUS · conexão pendente</span>`;
  }
  const tip = escapeAttr(source.tooltip ?? '');
  return `<span class="badge badge--neutral-soft" title="${tip}">${escapeHtml(source.label)}</span>`;
}

/**
 * @param {string} routeKey
 * @param {{ appPharusPending?: boolean }} [options]
 */
export function renderDataSourceNotice(routeKey, options = {}) {
  const cfg = PAGE_DATA_SOURCES[routeKey];
  if (!cfg) return '';

  const badges = cfg.sourceIds
    .map((id) => {
      if (id === 'app_pharus' && options.appPharusPending) {
        return badgeHtml(DATA_SOURCE_CATALOG.app_pharus, { pending: true });
      }
      const src = DATA_SOURCE_CATALOG[id];
      return src ? badgeHtml(src) : '';
    })
    .filter(Boolean)
    .join(' ');

  const extras = (cfg.extraBadges ?? [])
    .map(
      (b) =>
        `<span class="badge badge--${b.variant === 'muted' ? 'neutral-soft' : 'coral-soft'}">${escapeHtml(b.label)}</span>`,
    )
    .join(' ');

  const combinedTips = cfg.sourceIds
    .map((id) => DATA_SOURCE_CATALOG[id]?.tooltip)
    .filter(Boolean)
    .join(' ');

  return `<div class="data-source-notice historico-base0-notice" role="note">
    ${DB_ICON}
    <div class="data-source-notice__body historico-base0-notice__body">
      <p class="data-source-notice__title historico-base0-notice__title">
        <strong>${escapeHtml(cfg.lead ?? 'Fontes')}</strong>
        <span class="data-source-notice__badges">${badges}${extras ? ` ${extras}` : ''}</span>
      </p>
      <p class="data-source-notice__text historico-base0-notice__text">${escapeHtml(cfg.text)}</p>
    </div>
    ${combinedTips ? helpTip('', combinedTips) : ''}
  </div>`;
}
