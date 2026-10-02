import { createHash } from 'node:crypto';

/**
 * Hash estável para cache/classificação (Parte 11).
 * @param {object} params
 */
export function buildVocInputHash({
  question,
  answer,
  candidateThemes,
  promptVersion,
  model,
  classifierVersion,
}) {
  const payload = {
    question: String(question ?? ''),
    answer: String(answer ?? ''),
    candidate_themes: [...(candidateThemes ?? [])].sort(),
    prompt_version: promptVersion,
    model,
    classifier_version: classifierVersion,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildAnswerHash({ questionKey, answerText, score, npsCategory }) {
  const payload = {
    question_key: questionKey,
    answer_text: String(answerText ?? ''),
    score: score ?? null,
    nps_category: npsCategory ?? null,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
