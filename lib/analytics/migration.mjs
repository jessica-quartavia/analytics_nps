import { classifyNpsScore } from './nps.mjs';

/**
 * @param {string | null | undefined} previousCategory
 * @param {string | null | undefined} currentCategory
 * @returns {string | null}
 */
export function computeNpsMigration(previousCategory, currentCategory) {
  if (!previousCategory || !currentCategory) return null;
  if (previousCategory === currentCategory) return `${currentCategory} → ${currentCategory}`;
  return `${previousCategory} → ${currentCategory}`;
}

/**
 * @param {number | null | undefined} previousScore
 * @param {number | null | undefined} currentScore
 * @returns {number | null}
 */
export function computeScoreDelta(previousScore, currentScore) {
  if (previousScore == null || currentScore == null) return null;
  return currentScore - previousScore;
}

/**
 * @param {number | null | undefined} previousScore
 * @param {number | null | undefined} currentScore
 * @returns {string | null}
 */
export function computeEvolutionStatus(previousScore, currentScore) {
  if (previousScore == null || currentScore == null) return null;
  const delta = currentScore - previousScore;
  if (delta >= 3) return 'Grande melhora';
  if (delta >= 1) return 'Melhora';
  if (delta === 0) return 'Estável';
  if (delta >= -2) return 'Queda';
  return 'Queda severa';
}

/**
 * @param {number} score
 * @returns {string}
 */
export function categoryFromScore(score) {
  return classifyNpsScore(score);
}
