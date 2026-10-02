import { buildVocValenceUnits } from '../analytics/voc-ai-segments.mjs';
import { buildAnswerHash } from './voc-input-hash.mjs';

export function questionKey(question) {
  const q = String(question ?? '').trim().slice(0, 120);
  return Buffer.from(q || 'segment').toString('base64url').slice(0, 48);
}

/**
 * Expande resposta analítica (comment) em unidades VoC para persistência/classificação.
 * @param {object} response — shape de responses.json / buildAnalyticalResponsesFromSource
 */
export function expandResponseToWorkItems(response) {
  const comment = response.comment?.trim();
  if (!comment) return [];
  const { units } = buildVocValenceUnits(comment);
  return units.map((u, idx) => ({
    source_response_id: response.response_id,
    client_id: response.client_id ?? null,
    analytical_cycle_code: response.analytical_cycle_code ?? null,
    score: response.score ?? null,
    nps_category: response.nps_category ?? null,
    question_key: questionKey(u.question) || `seg_${idx}`,
    question_text: u.question,
    answer_text: u.answer,
    answer_hash: buildAnswerHash({
      questionKey: questionKey(u.question),
      answerText: u.answer,
      score: response.score,
      npsCategory: response.nps_category,
    }),
    submitted_at: response.submitted_at ?? null,
    source_updated_at: response.updated_at ?? response.submitted_at ?? null,
    unit: u,
    response,
  }));
}

/** @param {object[]} responses */
export function expandResponsesToWorkItems(responses) {
  const workItems = [];
  for (const r of responses ?? []) {
    workItems.push(...expandResponseToWorkItems(r));
  }
  return workItems;
}
