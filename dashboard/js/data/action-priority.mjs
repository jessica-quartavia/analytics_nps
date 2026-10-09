/**
 * Prioridade operacional única exibida na UI.
 * Correção humana vigente substitui a classificação automática.
 */
export function resolveActionPriority(row) {
  if (!row) return '—';
  const human = row.human_priority ?? row.priority_review?.human_priority;
  if (human) return human;
  return (
    row.display_priority ??
    row.final_priority ??
    row.hybrid_priority ??
    row.ai_priority ??
    row.priority ??
    '—'
  );
}

/** Classificação automática atual (antes de correção humana). */
export function resolveAutomaticPriority(row) {
  if (!row) return '—';
  return (
    row.display_priority ??
    row.final_priority ??
    row.hybrid_priority ??
    row.ai_priority ??
    row.priority ??
    '—'
  );
}
