import { escapeHtml } from '../utils/escape-html.js';

/**
 * Shell padrão do drawer (header + body com padding).
 * @param {{ title: string, subtitle?: string, closeId?: string, bodyHtml: string }} opts
 */
export function drawerShell({ title, subtitle, closeId = 'drawer-close', bodyHtml }) {
  return `
    <header class="drawer__header">
      <div class="drawer__header-text">
        <h2 class="drawer__title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="drawer__subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <button type="button" class="drawer__close" id="${escapeHtml(closeId)}" aria-label="Fechar">×</button>
    </header>
    <div class="drawer__body">${bodyHtml}</div>`;
}

export function drawerMetaGrid(items) {
  const cells = items
    .filter((i) => i?.value != null && i.value !== '')
    .map(
      (i) => `<div class="drawer-meta__item">
        <span class="drawer-meta__label">${escapeHtml(i.label)}</span>
        <span class="drawer-meta__value">${i.html ?? escapeHtml(String(i.value))}</span>
      </div>`,
    )
    .join('');
  return `<div class="drawer-meta">${cells}</div>`;
}

export function drawerQaBlock(question, answer) {
  if (!question && !answer) return '';
  return `<div class="drawer-qa">
    ${question ? `<p class="drawer-qa__q">${escapeHtml(question)}</p>` : ''}
    ${answer ? `<p class="drawer-qa__a">${escapeHtml(answer)}</p>` : ''}
  </div>`;
}

export function drawerTopicChips(topics) {
  if (!topics?.length) return '<p class="note-muted">Sem temas classificados.</p>';
  return `<div class="topic-chips">${topics
    .map((t) => {
      const tip =
        t.confidence != null || t.classification_source ?
          `conf. ${t.confidence ?? '—'} · ${t.classification_source ?? ''}${t.reviewed ? ' · revisado' : ''}`
        : '';
      return `<span class="topic-chip" ${tip ? `title="${escapeHtml(tip)}"` : ''}>
        <span class="topic-chip__name">${escapeHtml(t.topic)}</span>
        <span class="topic-chip__valence">${escapeHtml(t.valence)}</span>
      </span>`;
    })
    .join('')}</div>`;
}
