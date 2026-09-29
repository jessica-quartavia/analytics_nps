/** Limiares de rótulo de efeito (documentados para auditoria). */

export const SPEARMAN_EFFECT = [
  { max: 0.1, label: 'muito pequeno' },
  { max: 0.3, label: 'pequeno' },
  { max: 0.5, label: 'moderado' },
  { max: Infinity, label: 'forte' },
];

export const CRAMERS_V_EFFECT = [
  { max: 0.1, label: 'muito pequeno' },
  { max: 0.3, label: 'pequeno' },
  { max: 0.5, label: 'moderado' },
  { max: Infinity, label: 'forte' },
];

export const RANK_BISERIAL_EFFECT = [
  { max: 0.1, label: 'muito pequeno' },
  { max: 0.3, label: 'pequeno' },
  { max: 0.5, label: 'moderado' },
  { max: Infinity, label: 'forte' },
];

export const FDR_ALPHA = 0.05;
export const MIN_N_SPEARMAN = 15;
export const MIN_N_CHISQ = 20;
export const MIN_N_MANN_WHITNEY = 10;
export const MIN_N_LOGISTIC = 50;
export const MAX_LOGISTIC_PREDICTORS = 8;
export const MIN_FEATURE_COVERAGE = 0.35;

/** score_delta < 0 ou migração de queda. */
export function isDeteriorated(row) {
  if (row.score_delta != null && row.score_delta < 0) return true;
  const mig = row.nps_migration ?? row.migration;
  if (!mig || typeof mig !== 'string') return false;
  if (mig.includes('Neutro → Detrator') || mig.includes('Promotor → Detrator') || mig.includes('Promotor → Neutro')) {
    return true;
  }
  return false;
}

export function relevanceScore({ effect_size, n, nMax, qualityWeight, significantFdr }) {
  const abs = Math.abs(effect_size ?? 0);
  const cov = nMax > 0 ? Math.sqrt((n ?? 0) / nMax) : 0;
  const sig = significantFdr ? 1 : 0.55;
  return abs * cov * (qualityWeight ?? 1) * sig;
}

export const RELEVANCE_FORMULA_DOC =
  'relevance_score = |effect_size| × sqrt(n/n_max) × quality_weight × (1 se FDR<0.05 else 0.55)';
