import { isConsecutiveDetractor } from './evolution.mjs';

/**
 * @param {object} row
 * @param {Array<{ nps_category: string }>} orderedHistory cronológico incluindo row atual
 * @param {number} index índice de row em orderedHistory
 */
export function computeCriticalFlag(row, orderedHistory, index) {
  if (row.nps_migration === 'Promotor → Detrator') return true;
  if (row.evolution_status === 'Queda severa') return true;
  if (isConsecutiveDetractor(orderedHistory, index)) return true;
  return false;
}

/**
 * Promotor em todos os ciclos respondidos (>=2).
 * @param {Array<{ nps_category: string }>} ordered
 */
export function isPromotorConsistent(ordered) {
  if (ordered.length < 2) return false;
  return ordered.every((r) => r.nps_category === 'Promotor');
}
