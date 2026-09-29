import {
  computeEvolutionStatus,
  computeNpsMigration,
  computeScoreDelta,
  categoryFromScore,
} from './migration.mjs';

/**
 * Ordena respostas de um cliente por ciclo (starts_at) e submitted_at.
 * @param {Array<{ id: string, cycle_id: string, submitted_at: string, score: number, cycle_starts_at?: string | null }>} responses
 * @returns {Array<object>}
 */
export function sortClientResponsesChronologically(responses) {
  return [...responses].sort((a, b) => {
    const aStart = a.cycle_starts_at ? new Date(a.cycle_starts_at).getTime() : 0;
    const bStart = b.cycle_starts_at ? new Date(b.cycle_starts_at).getTime() : 0;
    if (aStart !== bStart) return aStart - bStart;
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  });
}

/**
 * Ordena por sequence do ciclo analítico (config), depois submitted_at.
 * @param {Array<object>} responses
 * @param {Map<string, number>} sequenceByCode
 */
export function sortClientResponsesByAnalyticalSequence(responses, sequenceByCode) {
  return [...responses].sort((a, b) => {
    const seqA = sequenceByCode.get(a.analytical_cycle_code) ?? 9999;
    const seqB = sequenceByCode.get(b.analytical_cycle_code) ?? 9999;
    if (seqA !== seqB) return seqA - seqB;
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  });
}

/**
 * Deriva campos históricos para uma lista cronológica de respostas do mesmo client_id.
 * @param {Array<{ id: string, score: number }>} ordered
 * @returns {Array<object>}
 */
export function deriveHistoryFields(ordered) {
  let previous = null;
  const cyclesAnswered = ordered.length;

  return ordered.map((row, index) => {
    const category = categoryFromScore(row.score);
    const isFirst = index === 0;

    const previousScore = isFirst ? null : previous.score;
    const previousCategory = isFirst ? null : categoryFromScore(previous.score);
    const previousResponseId = isFirst ? null : previous.id;

    const scoreDelta = computeScoreDelta(previousScore, row.score);
    const npsMigration = computeNpsMigration(previousCategory, category);
    const evolutionStatus = computeEvolutionStatus(previousScore, row.score);
    const recurringRespondent = !isFirst;

    const out = {
      ...row,
      previous_response_id: previousResponseId,
      previous_score: previousScore,
      score_delta: scoreDelta,
      previous_category: previousCategory,
      nps_migration: npsMigration,
      recurring_respondent: recurringRespondent,
      cycles_answered: cyclesAnswered,
      evolution_status: evolutionStatus,
      nps_category: category,
    };

    previous = { id: row.id, score: row.score };
    return out;
  });
}

/**
 * Detrator em dois ciclos consecutivos (por ordem cronológica).
 * @param {Array<{ nps_category: string }>} orderedWithCategories
 * @param {number} index
 */
export function isConsecutiveDetractor(orderedWithCategories, index) {
  if (index < 1) return false;
  return (
    orderedWithCategories[index].nps_category === 'Detrator' &&
    orderedWithCategories[index - 1].nps_category === 'Detrator'
  );
}
