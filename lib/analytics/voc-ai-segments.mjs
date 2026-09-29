import { OFFICIAL_TOPICS, TOPIC_KEYWORD_RULES } from './voc-config.mjs';
import { parseCommentSegments } from './voc-classifier.mjs';

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const NO_ADDITIONAL_COMMENT_RE =
  /^(nao|não|nada|nenhum|nenhuma|sem comentarios|sem comentários|sem comentario|sem comentário|n\/a|nao tenho|não tenho|nenhum comentario|nenhum comentário)\.?$/;

const ADDITIONAL_COMMENT_Q =
  /adicionar algum outro comentario|adicionar algum outro comentário|outro comentario sobre|outro comentário sobre/;

export function isNoAdditionalCommentAnswer(answer) {
  const a = normalizeText(String(answer ?? '').trim());
  if (!a) return true;
  return NO_ADDITIONAL_COMMENT_RE.test(a);
}

export function isAdditionalCommentQuestion(questionNorm) {
  return ADDITIONAL_COMMENT_Q.test(questionNorm ?? '');
}

function candidateThemesInAnswer(answerNormalized) {
  /** @type {string[]} */
  const found = [];
  for (const topic of OFFICIAL_TOPICS) {
    const keywords = TOPIC_KEYWORD_RULES[topic] ?? [];
    for (const kw of keywords) {
      const needle = normalizeText(kw);
      if (needle && answerNormalized.includes(needle)) {
        found.push(topic);
        break;
      }
    }
  }
  return found;
}

/**
 * Unidades pergunta/resposta para classificação de valência (temas por keyword no answer).
 * @param {string} comment
 */
export function buildVocValenceUnits(comment) {
  const raw = String(comment ?? '').trim();
  if (!raw) return { units: [], skippedNoAdditional: false };

  const { segments } = parseCommentSegments(raw);
  /** @type {Array<object>} */
  const units = [];
  let skippedNoAdditional = false;

  for (const seg of segments) {
    const qNorm = normalizeText(seg.question);
    const isAddQ = isAdditionalCommentQuestion(qNorm);
    if (isAddQ && isNoAdditionalCommentAnswer(seg.answer)) {
      skippedNoAdditional = true;
      continue;
    }
    const candidateThemes = candidateThemesInAnswer(seg.answerNormalized);
    if (!candidateThemes.length) continue;
    units.push({
      question: seg.question,
      answer: seg.answer,
      hint: seg.hint,
      candidate_themes: candidateThemes,
    });
  }

  return { units, skippedNoAdditional };
}
