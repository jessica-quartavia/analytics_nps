import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { resolveActionPriority } from '../data/action-priority.mjs';

const FALLBACK_TOOLTIP =
  'Classificação temporária por regras automáticas. A IA poderá atualizar esta sugestão quando estiver disponível.';

export function cell(value, emptyLabel = '—') {
  if (value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))) {
    return emptyLabel;
  }
  return String(value);
}

export function primaryTheme(row) {
  const neg = (row.topics ?? []).find((t) => t.valence === 'Negativa');
  const pick = neg ?? row.topics?.[0];
  if (pick?.topic) return pick.topic;
  return row.ai_theme ?? row.primary_topic ?? '—';
}

export function rowSourceKind(row) {
  if (row.human_priority || row.priority_review) return 'reviewed';
  if (row.ai_classifier_source === 'gemini') return 'gemini';
  if (row.ai_classifier_source === 'rules_fallback') return 'fallback';
  if (row.ai_classifier_source) return 'other';
  return 'none';
}

export function renderSourceBadge(row) {
  const kind = rowSourceKind(row);
  if (kind === 'reviewed') {
    return '<span class="badge badge--method">Revisado</span>';
  }
  if (kind === 'gemini') {
    return '<span class="badge badge--method">Gemini</span>';
  }
  if (kind === 'fallback') {
    return `<span class="badge badge--neutral-soft" title="${escapeAttr(FALLBACK_TOOLTIP)}">Fallback</span>`;
  }
  if (kind === 'other') {
    return `<span class="badge badge--neutral-soft">${escapeHtml(row.ai_classifier_source)}</span>`;
  }
  return '<span class="note-muted">Não classificado</span>';
}

/** PHARUS/DAVOS a partir da resposta NPS (mesma regra do pipeline). */
export function resolveRowProgram(row, response) {
  const raw = response?.program ?? row?.program ?? row?.program_name ?? null;
  if (!raw) return '—';
  const s = String(raw).trim();
  return s || '—';
}

export function hasActionProposal(row) {
  const text = row?.plan?.action_text ?? row?.plan?.action_proposal ?? '';
  return Boolean(String(text).trim());
}

/** @deprecated use resolveActionPriority */
export function finalPriorityLabel(row) {
  return resolveActionPriority(row);
}

export { resolveActionPriority };
