/** Regra oficial de Tier (derivado localmente — não existe no BASE QV). */

export const TIER_THRESHOLDS = {
  T1_INCOME: 100_000,
  T1_CONTRIBUTION: 30_000,
  T1_RESERVE: 500_000,
  T2_INCOME_MIN: 50_000,
  T3_INCOME_MIN: 20_000,
};

/**
 * NULL ≠ 0. Negativos = invalid (não entram nos limiares).
 * @returns {{ status: 'null'|'valid'|'invalid', value: number|null }}
 */
export function parseFinancialNumeric(raw) {
  if (raw == null || raw === '') return { status: 'null', value: null };
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
  if (Number.isNaN(n)) return { status: 'invalid', value: null };
  if (n < 0) return { status: 'invalid', value: n };
  return { status: 'valid', value: n };
}

export function deriveHasDebts(finRow) {
  if (!finRow) return null;
  const flags = [
    finRow.cheque_especial,
    finRow.parcelamento_cartao,
    finRow.credito_pessoal,
    finRow.credito_consignado,
  ];
  if (flags.every((v) => v == null)) return null;
  return flags.some((v) => v === true);
}

function tierReasonFromFlags({ income, contribution, reserve }) {
  const parts = [];
  if (income) parts.push('income');
  if (contribution) parts.push('contribution');
  if (reserve) parts.push('reserve');
  return parts.length ? parts.join('+') : null;
}

/**
 * @param {{ income?: *, contribution?: *, reserve?: * }} fields
 */
export function deriveFinancialTier(fields) {
  const income = parseFinancialNumeric(fields.income);
  const contribution = parseFinancialNumeric(fields.contribution);
  const reserve = parseFinancialNumeric(fields.reserve);

  const t1Income =
    income.status === 'valid' && income.value >= TIER_THRESHOLDS.T1_INCOME;
  const t1Contrib =
    contribution.status === 'valid' && contribution.value >= TIER_THRESHOLDS.T1_CONTRIBUTION;
  const t1Reserve =
    reserve.status === 'valid' && reserve.value >= TIER_THRESHOLDS.T1_RESERVE;

  if (t1Income || t1Contrib || t1Reserve) {
    return {
      tier: 'T1',
      tier_reason: tierReasonFromFlags({
        income: t1Income,
        contribution: t1Contrib,
        reserve: t1Reserve,
      }),
      income,
      contribution,
      reserve,
    };
  }

  if (income.status !== 'valid') {
    return {
      tier: 'unavailable',
      tier_reason: null,
      income,
      contribution,
      reserve,
    };
  }

  const v = income.value;
  if (v >= TIER_THRESHOLDS.T2_INCOME_MIN && v < TIER_THRESHOLDS.T1_INCOME) {
    return { tier: 'T2', tier_reason: 'income', income, contribution, reserve };
  }
  if (v >= TIER_THRESHOLDS.T3_INCOME_MIN && v < TIER_THRESHOLDS.T2_INCOME_MIN) {
    return { tier: 'T3', tier_reason: 'income', income, contribution, reserve };
  }
  if (v < TIER_THRESHOLDS.T3_INCOME_MIN) {
    return { tier: 'T4', tier_reason: 'income', income, contribution, reserve };
  }

  return {
    tier: 'unavailable',
    tier_reason: null,
    income,
    contribution,
    reserve,
  };
}

/** Valores simbólicos/anômalos para QA (não altera Tier se numericamente válidos). */
export function isSymbolicFinancialValue(value) {
  if (value == null || Number.isNaN(value) || value < 0) return false;
  return value > 0 && value <= 1;
}

/** Critérios T1 sobrepostos — contagens entre clientes classificados T1 (não somam a n T1). */
export function countT1CriteriaOverlap(tier1Entries) {
  let income_ge_100k = 0;
  let reserve_ge_500k = 0;
  let contribution_ge_30k = 0;
  for (const e of tier1Entries) {
    const inc = parseFinancialNumeric(e.income ?? e._raw_income);
    const con = parseFinancialNumeric(e.contribution ?? e._raw_contribution);
    const res = parseFinancialNumeric(e.reserve ?? e._raw_reserve);
    if (inc.status === 'valid' && inc.value >= TIER_THRESHOLDS.T1_INCOME) income_ge_100k++;
    if (con.status === 'valid' && con.value >= TIER_THRESHOLDS.T1_CONTRIBUTION) contribution_ge_30k++;
    if (res.status === 'valid' && res.value >= TIER_THRESHOLDS.T1_RESERVE) reserve_ge_500k++;
  }
  return {
    n_t1: tier1Entries.length,
    income_ge_100k,
    reserve_ge_500k,
    contribution_ge_30k,
    note: 'Um mesmo cliente pode atender mais de um critério.',
  };
}

export function assertTierDistribution(tierCounts, expectedTotal) {
  const sum =
    (tierCounts.T1 ?? 0) +
    (tierCounts.T2 ?? 0) +
    (tierCounts.T3 ?? 0) +
    (tierCounts.T4 ?? 0) +
    (tierCounts.unavailable ?? 0);
  return { sum, expectedTotal, ok: sum === expectedTotal };
}
