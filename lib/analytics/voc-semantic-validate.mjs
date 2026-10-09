/**
 * Validação pós-Gemini/rules: conflito entre evidence, nota NPS (tendência) e valência.
 */
import { isDetractorScore, isPromoterScore, scoreToExpectedSentimentBias } from './voc-score-bias.mjs';

const EXPLICIT_NEGATIVE_EVIDENCE = [
  /\bn[aã]o agregou\b/i,
  /\bn[aã]o entregou\b/i,
  /\bn[aã]o tive resultado\b/i,
  /\bn[aã]o vejo a hora\b/i,
  /\bp[eé]ssim/i,
  /\bn[aã]o compensou\b/i,
  /\bn[aã]o recomendo\b/i,
  /\bn[aã]o indico\b/i,
  /\bprecisa entregar\b/i,
  /\besperava (?:muito )?mais\b/i,
  /\bn[aã]o valeu\b/i,
  /\bn[aã]o funcionou\b/i,
  /\bsem resultado\b/i,
  /\bdecepcion/i,
  /\binsatisfe/i,
  /\bfraco\b/i,
  /\bn[aã]o percebo\b/i,
  /\bn[aã]o justifica\b/i,
  /\btinha expectativas melhores\b/i,
  /\bdevolu[cç][aã]o\b/i,
  /\bdesorganiz/i,
  /\bpreju[ií]zo\b/i,
  /\bn[aã]o tem habilidade\b/i,
];

const STRONG_NEGATIVE_ANSWER = [
  /\bn[aã]o agregou\b/i,
  /\bp[eé]ssim/i,
  /\bn[aã]o indico\b/i,
  /\bn[aã]o recomendo\b/i,
  /\bdesorganiz/i,
  /\bfrustrad/i,
  /\bpreju[ií]zo\b/i,
  /\bn[aã]o entregou\b/i,
  /\bn[aã]o tive resultado\b/i,
];

const EXPLICIT_POSITIVE_EVIDENCE = [
  /\bvaleu (?:o )?investimento\b/i,
  /\bsuperou\b/i,
  /\bexcelente\b/i,
  /\bmuito satisfeit/i,
  /\brecomendo\b/i,
  /\bótimo\b/i,
  /\bbom atendimento\b/i,
];

const IMPROVEMENT_QUESTION = /melhorar|merecer (?:uma )?nota|o que (?:poder[ií]amos|voc[eê]s podem) fazer|continuar (?:conosco|com a gente)/i;

const CONDITIONAL_DEMAND = /entregar|precisa|deveria|melhorar|trocar|transpar[eê]ncia|resultado|retorno|mudar o quadro/i;

const EP_THEME = 'Engenheiro Patrimonial';

/**
 * @param {string} evidence
 * @param {string} valence
 */
export function evidenceConflictsWithPositiveValence(evidence, valence) {
  if (valence !== 'Positiva') return false;
  const text = String(evidence ?? '').trim();
  if (!text) return false;
  return EXPLICIT_NEGATIVE_EVIDENCE.some((re) => re.test(text));
}

export function answerIsStronglyNegative(answer) {
  const a = String(answer ?? '').trim();
  if (!a) return false;
  return STRONG_NEGATIVE_ANSWER.some((re) => re.test(a));
}

/**
 * @param {string} question
 * @param {string} answer
 * @param {string} valence
 */
export function conditionalAnswerConflictsWithPositive(question, answer, valence) {
  if (valence !== 'Positiva') return false;
  const q = String(question ?? '');
  const a = String(answer ?? '');
  if (!IMPROVEMENT_QUESTION.test(q)) return false;
  return CONDITIONAL_DEMAND.test(a);
}

/**
 * Crítica direta ao engenheiro + EP Positiva.
 */
export function engineerCriticismConflictsWithPositive(theme, answer, valence) {
  if (theme !== EP_THEME || valence !== 'Positiva') return false;
  const a = String(answer ?? '');
  return /\bengenheiro\b/i.test(a) && /\b(n[aã]o tem habilidade|fraco|troca|p[eé]ssim|n[aã]o indico)\b/i.test(a);
}

/**
 * @param {Array<{ theme: string, valence: string }>} classifications
 * @param {number|null|undefined} score
 */
export function detectScoreTextConflict(classifications, score, answer) {
  const bias = scoreToExpectedSentimentBias(score);
  if (bias === 'unknown' || !classifications?.length) {
    return { score_text_conflict: false, reason: null };
  }

  const positiveCount = classifications.filter((c) => c.valence === 'Positiva').length;
  const negativeCount = classifications.filter((c) => c.valence === 'Negativa').length;
  const strongNeg = answerIsStronglyNegative(answer);

  if (isDetractorScore(score)) {
    if (positiveCount >= 2 && (strongNeg || negativeCount === 0)) {
      return { score_text_conflict: true, reason: 'detractor_multiple_positive' };
    }
    if (score === 0 && positiveCount >= 1 && strongNeg) {
      return { score_text_conflict: true, reason: 'score_zero_positive_with_critical_text' };
    }
    if (positiveCount >= 1 && strongNeg && negativeCount === 0) {
      return { score_text_conflict: true, reason: 'detractor_positive_without_negative_themes' };
    }
  }

  if (isPromoterScore(score) && negativeCount >= 2 && positiveCount === 0) {
    const a = String(answer ?? '');
    const hasPraise = EXPLICIT_POSITIVE_EVIDENCE.some((re) => re.test(a));
    if (hasPraise) {
      return { score_text_conflict: true, reason: 'promoter_all_negative_with_praise' };
    }
  }

  return { score_text_conflict: false, reason: null };
}

/**
 * @param {Array<{ theme: string, valence: string, confidence: number, evidence: string, reason?: string, needs_human_review?: boolean }>} classifications
 * @param {{ question?: string, answer?: string, score?: number|null, nps_category?: string|null }} context
 */
export function applySemanticReviewFlags(classifications, context = {}) {
  const { question = '', answer = '', score = null } = context;
  const unitScoreConflict = detectScoreTextConflict(classifications, score, answer);

  return classifications.map((c) => {
    const semantic_conflict =
      evidenceConflictsWithPositiveValence(c.evidence, c.valence) ||
      conditionalAnswerConflictsWithPositive(question, answer, c.valence) ||
      engineerCriticismConflictsWithPositive(c.theme, answer, c.valence);

    let score_text_conflict = false;
    if (c.valence === 'Positiva' && isDetractorScore(score)) {
      if (evidenceConflictsWithPositiveValence(c.evidence, c.valence) || engineerCriticismConflictsWithPositive(c.theme, answer, c.valence)) {
        score_text_conflict = true;
      }
    }
    if (unitScoreConflict.score_text_conflict && c.valence === 'Positiva' && isDetractorScore(score)) {
      score_text_conflict = true;
    }

    const needs_human_review =
      Boolean(c.needs_human_review) || semantic_conflict || score_text_conflict || unitScoreConflict.score_text_conflict;

    return {
      ...c,
      semantic_conflict,
      score_text_conflict,
      score_text_conflict_reason: score_text_conflict ? unitScoreConflict.reason : null,
      needs_human_review,
    };
  });
}
