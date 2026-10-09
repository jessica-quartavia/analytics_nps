/** Prioridades operacionais (Plano de Ação). */
export const OPERATIONAL_PRIORITIES = [
  'Crítica',
  'Alta',
  'Média',
  'Baixa',
  'Acompanhamento positivo',
];

const SEVERE_NEGATIVE_TOPICS = new Set([
  'Expectativa',
  'Resultados',
  'Valor percebido',
  'Engenheiro Patrimonial',
  'Atendimento / relacionamento',
]);

const NEGATIVE_MIGRATIONS = new Set([
  'Promotor → Detrator',
  'Promotor → Neutro',
  'Neutro → Detrator',
]);

function scoreFromNps(current) {
  const s = Number(current);
  if (Number.isNaN(s)) return 0;
  if (s <= 3) return 100;
  if (s <= 6) return 75;
  if (s <= 8) return 40;
  return 10;
}

function scoreFromVoc(topics = []) {
  const neg = topics.filter((t) => t.valence === 'Negativa');
  if (!neg.length) return 0;
  let score = 15 * neg.length;
  for (const t of neg) {
    if (SEVERE_NEGATIVE_TOPICS.has(t.topic)) score += 25;
    if (t.semantic_conflict) score += 15;
    if (t.classifier_source === 'human_review' || t.reviewed) score += 10;
  }
  return Math.min(100, score);
}

function scoreFromEvolution(row) {
  let score = 0;
  const delta = row.score_delta ?? null;
  if (delta != null && delta <= -4) score += 40;
  else if (delta != null && delta <= -2) score += 25;
  if (NEGATIVE_MIGRATIONS.has(row.nps_migration ?? '')) score += 35;
  if (row.current_category === 'Detrator' && row.previous_category === 'Promotor') score += 30;
  return Math.min(100, score);
}

function scoreFromRecurrence(row, topics) {
  let score = 0;
  if (row.consecutive_detractor) score += 25;
  const negCount = topics.filter((t) => t.valence === 'Negativa').length;
  if (negCount >= 2) score += 15;
  return score;
}

export function computeHybridPriorityScore(row) {
  const topics = row.topics ?? [];
  const components = {
    nps: scoreFromNps(row.current_score),
    voc: scoreFromVoc(topics),
    evolution: scoreFromEvolution(row),
    recurrence: scoreFromRecurrence(row, topics),
  };
  const total = components.nps + components.voc + components.evolution + components.recurrence;
  return { score: total, components };
}

export function scoreToPriority(score, row) {
  const s = Number(row.current_score);
  const negTopics = (row.topics ?? []).filter((t) => t.valence === 'Negativa');
  const hasSevereNeg = negTopics.some((t) => SEVERE_NEGATIVE_TOPICS.has(t.topic));

  if (!Number.isNaN(s) && s <= 3 && negTopics.length) return 'Crítica';
  if (!Number.isNaN(s) && s <= 3) return 'Alta';
  if (score >= 120 || (row.current_category === 'Detrator' && hasSevereNeg && score >= 80)) {
    return 'Crítica';
  }
  if (score >= 85) return 'Alta';
  if (score >= 50) return 'Média';
  if (
    row.current_category === 'Promotor' &&
    negTopics.length === 0 &&
    (row.score_delta ?? 0) >= -1
  ) {
    return 'Acompanhamento positivo';
  }
  return 'Baixa';
}

/**
 * Combina score determinístico + sugestão IA (se houver).
 */
export function mergeHybridWithAi(hybridPriority, aiPriority, aiConfidence = 0) {
  const rank = {
    Crítica: 5,
    Alta: 4,
    Média: 3,
    Baixa: 2,
    'Acompanhamento positivo': 1,
  };
  const h = rank[hybridPriority] ?? 2;
  const a = rank[aiPriority] ?? 2;
  if (!aiPriority || aiConfidence < 0.5) return hybridPriority;
  if (a >= h) return aiPriority;
  if (h - a === 1 && aiConfidence >= 0.75) return aiPriority;
  return hybridPriority;
}

export function enrichEntryWithHybridPriority(entry) {
  const { score, components } = computeHybridPriorityScore(entry);
  const hybrid_priority = scoreToPriority(score, entry);
  const ai_priority = entry.ai_priority ?? entry.classification?.priority ?? null;
  const ai_confidence = entry.ai_confidence ?? entry.classification?.confidence ?? 0;
  const suggested_ai = ai_priority
    ? mergeHybridWithAi(hybrid_priority, ai_priority, ai_confidence)
    : hybrid_priority;
  return {
    ...entry,
    hybrid_priority,
    hybrid_score: score,
    hybrid_score_components: components,
    ai_priority: ai_priority ?? suggested_ai,
    final_priority:
      entry.human_priority ??
      entry.final_priority ??
      (ai_priority ? suggested_ai : hybrid_priority),
    priority_score: score,
  };
}

export function needsAttention(row) {
  const score = row.current_score;
  const neg = (row.topics ?? []).some((t) => t.valence === 'Negativa');
  const fp = row.final_priority ?? row.priority;
  if (fp === 'Crítica' || fp === 'Alta') return true;
  if (score != null && score <= 6 && neg) return true;
  if (score != null && score <= 3) return true;
  if ((row.score_delta ?? 0) <= -3) return true;
  if (row.current_category === 'Detrator' && neg) return true;
  return false;
}

export function isCriticalHighlight(row) {
  const s = Number(row.current_score);
  const neg = (row.topics ?? []).some((t) => t.valence === 'Negativa');
  return !Number.isNaN(s) && s <= 3 && neg;
}
