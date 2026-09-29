import { classifyNpsScore } from './nps.mjs';
import { calculateNpsConfidenceInterval } from './nps-confidence.mjs';
import { chiSquareWithCramersV, mannWhitneyU } from './driver-stats.mjs';
import { proportionTest } from './nps-milestones-stats.mjs';
import { mechanismBucket } from './nps-change-drivers.mjs';
import { mean, median, iqr } from './milestone-temporal.mjs';
import {
  deriveFinancialTier,
  deriveHasDebts,
  parseFinancialNumeric,
  isSymbolicFinancialValue,
  countT1CriteriaOverlap,
  assertTierDistribution,
} from './financial-tier.mjs';

export const SET_CYCLE_CODE = 'NPS-2026-SET-PHARUS';
const MIN_CELL_N = 5;
const MIN_INSIGHT_N = 8;
const COVERAGE_GOOD = 80;

function npsFromScores(scores) {
  const xs = scores.filter((s) => s != null && !Number.isNaN(s));
  if (!xs.length) return null;
  let p = 0;
  let d = 0;
  for (const s of xs) {
    const c = classifyNpsScore(s);
    if (c === 'Promotor') p++;
    else if (c === 'Detrator') d++;
  }
  return ((p - d) / xs.length) * 100;
}

function pctCategory(scores, cat) {
  const xs = scores.filter((s) => s != null);
  if (!xs.length) return null;
  const n = xs.filter((s) => classifyNpsScore(s) === cat).length;
  return (n / xs.length) * 100;
}

function parseTs(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
  if (/[+-]\d{2}$/.test(s)) s = `${s}:00`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function financialTemporalQuality(updatedAt, submittedAt) {
  const u = parseTs(updatedAt);
  const s = parseTs(submittedAt);
  if (u == null || s == null) return 'unknown';
  if (u <= s) return 'prior_or_same_day';
  return 'current_proxy_after_response';
}

function numericForEntry(parsed) {
  if (parsed.status === 'valid') return parsed.value;
  return null;
}

export function buildFinancialProfileEntry(response, finRow, milestoneRow, financialSource = 'missing') {
  const tierOut = deriveFinancialTier({
    income: finRow?.ultima_renda_mensal,
    contribution: finRow?.ultimo_aporte,
    reserve: finRow?.reserva_liquidez,
  });
  const submittedAt = response.submitted_at;
  const updatedAt = finRow?.updated_at ?? null;
  const temporal = financialTemporalQuality(updatedAt, submittedAt);

  return {
    client_id: response.client_id,
    cycle_code: response.analytical_cycle_code,
    has_financial_row: Boolean(finRow) && financialSource !== 'missing',
    financial_source: financialSource,
    score: response.score,
    nps_category: response.nps_category ?? classifyNpsScore(response.score),
    income: numericForEntry(tierOut.income),
    contribution: numericForEntry(tierOut.contribution),
    reserve: numericForEntry(tierOut.reserve),
    tier: tierOut.tier,
    tier_reason: tierOut.tier_reason,
    tier_quality: 'current_proxy',
    has_debts: deriveHasDebts(finRow),
    financial_updated_at: updatedAt,
    financial_before_response: temporal === 'prior_or_same_day' ? true : temporal === 'current_proxy_after_response' ? false : null,
    financial_temporal_quality: temporal,
    mechanisms_count_before_response: milestoneRow?.mechanisms_count_before_response ?? null,
    mechanism_bucket: mechanismBucket(milestoneRow?.mechanisms_count_before_response),
  };
}

export function buildFinancialProfileCoverage(entries, respondentsTotal, sourceCounts = null) {
  const withFin = entries.filter((e) => e.has_financial_row);
  const tierClassified = entries.filter((e) => ['T1', 'T2', 'T3', 'T4'].includes(e.tier));
  const tierUnavailable = entries.filter((e) => e.tier === 'unavailable');

  const tierCounts = { T1: 0, T2: 0, T3: 0, T4: 0, unavailable: 0 };
  for (const e of entries) {
    if (tierCounts[e.tier] != null) tierCounts[e.tier]++;
    else tierCounts.unavailable++;
  }

  const coveragePct = respondentsTotal ? (withFin.length / respondentsTotal) * 100 : null;
  const allRawSnapshot =
    sourceCounts != null &&
    sourceCounts.missing === 0 &&
    sourceCounts.fallback_export === 0 &&
    sourceCounts.raw_snapshot === respondentsTotal;

  return {
    respondents_total: respondentsTotal,
    financial_rows: withFin.length,
    financial_source_counts: sourceCounts ?? {
      raw_snapshot: entries.filter((e) => e.financial_source === 'raw_snapshot').length,
      fallback_export: entries.filter((e) => e.financial_source === 'fallback_export').length,
      missing: entries.filter((e) => e.financial_source === 'missing').length,
    },
    coverage_among_available_financial_set_pct: coveragePct,
    coverage_statement:
      'Percentual sobre respondentes Set com linha no conjunto financeiro disponível para esta análise (raw snapshot + fallback export).',
    all_clients_from_raw_snapshot: allRawSnapshot,
    do_not_label_as_full_base_qv_snapshot: !allRawSnapshot,
    tier_classified: tierClassified.length,
    tier_unavailable: tierUnavailable.length,
    invalid_income: 0,
    invalid_contribution: 0,
    invalid_reserve: 0,
    coverage_pct: coveragePct,
    coverage_quality:
      coveragePct == null ? 'unknown' : coveragePct >= COVERAGE_GOOD ? 'good' : coveragePct >= 50 ? 'partial' : 'low',
    tier_distribution: tierCounts,
  };
}

function npsTierStats(rows) {
  const scores = rows.map((r) => r.score);
  const n = scores.length;
  if (!n) return { n: 0 };
  const ci = calculateNpsConfidenceInterval(scores, { seed: 20260929 });
  return {
    n,
    nps: npsFromScores(scores),
    mean_score: mean(scores),
    median_score: median(scores),
    pct_promoters: pctCategory(scores, 'Promotor'),
    pct_neutrals: pctCategory(scores, 'Neutro'),
    pct_detractors: pctCategory(scores, 'Detrator'),
    nps_ci_low: n >= MIN_INSIGHT_N ? ci.nps_ci_low : null,
    nps_ci_high: n >= MIN_INSIGHT_N ? ci.nps_ci_high : null,
  };
}

export function buildNpsByTier(entries) {
  const tiers = ['T1', 'T2', 'T3', 'T4', 'unavailable'];
  return Object.fromEntries(
    tiers.map((t) => [t, npsTierStats(entries.filter((e) => e.tier === t))]),
  );
}

export function buildDebtsVsNps(entries) {
  const withDebts = entries.filter((e) => e.has_debts === true);
  const withoutDebts = entries.filter((e) => e.has_debts === false);
  return {
    debts_true: npsTierStats(withDebts),
    debts_false: npsTierStats(withoutDebts),
    note: 'Comparação associativa — débitos não definem Tier.',
  };
}

export function buildTierDebtsCross(entries, minN = MIN_CELL_N) {
  const cells = [];
  for (const tier of ['T1', 'T2', 'T3', 'T4']) {
    for (const debts of [true, false]) {
      const rows = entries.filter((e) => e.tier === tier && e.has_debts === debts);
      if (rows.length >= minN) {
        cells.push({
          tier,
          has_debts: debts,
          ...npsTierStats(rows),
        });
      }
    }
  }
  return { min_n: minN, cells, shown_cell_count: cells.length };
}

function resultadosNegativeClientIds(responseTopics, responses, cycleCode) {
  const byResp = new Map(
    responses.filter((r) => r.analytical_cycle_code === cycleCode).map((r) => [r.response_id, r]),
  );
  const ids = new Set();
  for (const t of responseTopics) {
    if (t.analytical_cycle_code !== cycleCode || t.topic !== 'Resultados' || t.valence !== 'Negativa') continue;
    const r = byResp.get(t.response_id);
    if (r?.client_id) ids.add(r.client_id);
  }
  return ids;
}

export function buildResultadosXTier(entries, negClientIds) {
  const classified = entries.filter((e) => ['T1', 'T2', 'T3', 'T4'].includes(e.tier));
  const neg = classified.filter((e) => negClientIds.has(e.client_id));
  const rest = classified.filter((e) => !negClientIds.has(e.client_id));
  const tiers = ['T1', 'T2', 'T3', 'T4'];

  function distrib(rows) {
    const n = rows.length;
    const counts = Object.fromEntries(tiers.map((t) => [t, 0]));
    for (const r of rows) counts[r.tier]++;
    const pct = Object.fromEntries(
      tiers.map((t) => [t, n ? (counts[t] / n) * 100 : null]),
    );
    return { n, counts, pct };
  }

  const dNeg = distrib(neg);
  const dRest = distrib(rest);

  let association = { test: 'insufficient_n', p_value: null };
  if (neg.length >= MIN_CELL_N && rest.length >= MIN_CELL_N) {
    const table = [
      tiers.map((t) => dNeg.counts[t]),
      tiers.map((t) => dRest.counts[t]),
    ];
    const minCell = Math.min(...table.flat());
    if (minCell >= 1 && neg.length + rest.length >= 2 * MIN_CELL_N) {
      association = {
        ...chiSquareWithCramersV(2, tiers.length, table),
        test: 'chi_square',
      };
    } else {
      association = { test: 'chi_square_skipped', p_value: null, reason: 'small_cells' };
    }
  }

  return {
    question: 'Clientes que reclamam de Resultados estão concentrados em algum Tier?',
    resultados_negative: dNeg,
    others: dRest,
    association,
    note: 'Somente respondentes com Tier classificado (T1–T4).',
  };
}

function mannWhitneyFinancial(negIds, entries, field) {
  const vals = (ids) =>
    entries
      .filter((e) => ids.has(e.client_id) && e[field] != null)
      .map((e) => e[field]);
  const neg = vals(negIds);
  const rest = entries
    .filter((e) => !negIds.has(e.client_id) && e[field] != null)
    .map((e) => e[field]);
  return {
    median_negative: median(neg),
    median_others: median(rest),
    iqr_negative: iqr(neg),
    iqr_others: iqr(rest),
    n_negative: neg.length,
    n_others: rest.length,
    mann_whitney: neg.length && rest.length ? mannWhitneyU(neg, rest) : { p_value: null },
    note:
      field === 'contribution'
        ? 'Medianas iguais não implicam distribuições iguais; ultimo_aporte é proxy ambíguo (não garantido mensal).'
        : undefined,
  };
}

export function buildResultadosXReserve(entries, negClientIds) {
  const r = mannWhitneyFinancial(negClientIds, entries, 'reserve');
  return {
    ...r,
    interpretation:
      r.mann_whitney?.p_value != null && r.mann_whitney.p_value < 0.05
        ? 'Diferença exploratória na distribuição de reserva.'
        : 'Sem evidência estatística convencional de diferença na mediana/IQR (p≥0,05 ou n insuficiente).',
  };
}

export function buildResultadosXContribution(entries, negClientIds) {
  return mannWhitneyFinancial(negClientIds, entries, 'contribution');
}

export function buildResultadosXDebts(entries, negClientIds) {
  const neg = entries.filter((e) => negClientIds.has(e.client_id));
  const rest = entries.filter((e) => !negClientIds.has(e.client_id));
  const pred = (e) => e.has_debts === true;
  return {
    n_negative: neg.length,
    n_others: rest.length,
    pct_debts_negative: neg.length ? (neg.filter(pred).length / neg.length) * 100 : null,
    pct_debts_others: rest.length ? (rest.filter(pred).length / rest.length) * 100 : null,
    ...proportionTest(neg, rest, pred),
    note: 'Associação — não causalidade.',
  };
}

export function buildTierXMechanisms(entries) {
  const classified = entries.filter((e) => ['T1', 'T2', 'T3', 'T4'].includes(e.tier));
  const buckets = ['0', '1', '2+'];
  const matrix = [];
  for (const tier of ['T1', 'T2', 'T3', 'T4']) {
    const tierRows = classified.filter((e) => e.tier === tier);
    const row = { tier, n: tierRows.length, by_mechanism_bucket: {} };
    for (const b of buckets) {
      const cell = tierRows.filter((e) => e.mechanism_bucket === b);
      row.by_mechanism_bucket[b] = {
        n: cell.length,
        shown: cell.length >= MIN_CELL_N,
        pct: tierRows.length ? (cell.length / tierRows.length) * 100 : null,
      };
    }
    matrix.push(row);
  }
  return {
    question: 'Clientes de Tier mais alto têm mais mecanismos implementados?',
    matrix,
    note: 'Associação exploratória — snapshot financeiro atual (proxy).',
  };
}

export function buildResultadosXTierXMechanisms(entries, negClientIds, minN = MIN_CELL_N) {
  const cells = [];
  for (const tier of ['T1', 'T2', 'T3', 'T4']) {
    for (const b of ['0', '1', '2+']) {
      const neg = entries.filter(
        (e) =>
          e.tier === tier &&
          e.mechanism_bucket === b &&
          negClientIds.has(e.client_id),
      );
      if (neg.length >= minN) {
        cells.push({ tier, mechanism_bucket: b, resultados_negative_n: neg.length, shown: true });
      }
    }
  }
  return {
    shown: cells.length > 0,
    min_n: minN,
    cells,
    note: 'Publicar apenas células com n suficiente.',
  };
}

export function buildFinancialProfileQa(entries, finRows, coverage, opts = {}) {
  const tierReasons = {};
  const invalidValues = { income: 0, contribution: 0, reserve: 0 };
  const nullValues = { income: 0, contribution: 0, reserve: 0 };
  const symbolic = { income: 0, contribution: 0, reserve: 0 };
  let debtsTrue = 0;
  let debtsFalse = 0;
  let debtsUnknown = 0;
  const temporal = { prior_or_same_day: 0, current_proxy_after_response: 0, unknown: 0 };

  for (const row of finRows) {
    for (const [field, key] of [
      ['income', 'ultima_renda_mensal'],
      ['contribution', 'ultimo_aporte'],
      ['reserve', 'reserva_liquidez'],
    ]) {
      const p = parseFinancialNumeric(row[key]);
      if (p.status === 'invalid') invalidValues[field]++;
      if (p.status === 'null') nullValues[field]++;
      if (p.status === 'valid' && isSymbolicFinancialValue(p.value)) symbolic[field]++;
    }
  }

  const tierDistributionCheck = assertTierDistribution(coverage.tier_distribution, coverage.respondents_total);

  for (const e of entries) {
    if (e.tier_reason) tierReasons[e.tier_reason] = (tierReasons[e.tier_reason] ?? 0) + 1;
    if (e.has_debts === true) debtsTrue++;
    else if (e.has_debts === false) debtsFalse++;
    else debtsUnknown++;
    if (temporal[e.financial_temporal_quality] != null) temporal[e.financial_temporal_quality]++;
  }

  return {
    generated_at: new Date().toISOString(),
    cycle_code: opts.cycleCode ?? SET_CYCLE_CODE,
    coverage,
    tier_counts: coverage.tier_distribution,
    tier_reasons: tierReasons,
    invalid_values: invalidValues,
    null_values: nullValues,
    symbolic_anomaly_counts: symbolic,
    debts_counts: { true: debtsTrue, false: debtsFalse, unknown: debtsUnknown },
    temporal_quality: temporal,
    tier_quality: 'current_proxy',
    aporte_semantics: 'ambiguous',
    aporte_semantics_warning:
      'ultimo_aporte é o último valor registrado; o schema não garante periodicidade mensal. Tier T1 por aporte usa esse proxy até validação.',
    financial_source: opts.financialSource ?? 'unknown',
    financial_source_counts: coverage.financial_source_counts,
    tier_qa: {
      actual: coverage.tier_distribution,
      distribution_ok: tierDistributionCheck.ok,
      total_respondents: coverage.respondents_total,
      t1_criteria_overlap: countT1CriteriaOverlap(entries.filter((e) => e.tier === 'T1')),
    },
    coverage_reconciliation: opts.coverageReconciliation ?? null,
    limitations: [
      'Tier derivado localmente — não histórico PIT para Jun–Jul.',
      'Dados financeiros são snapshot; majoritariamente proxy na data da resposta.',
    ],
  };
}

export function generateFinancialAutoInsights(doc) {
  const insights = [];
  const cov = doc.financial_profile_coverage;
  if ((cov?.coverage_pct ?? 0) < COVERAGE_GOOD) return insights;

  const after = doc.financial_profile_coverage?.temporal_after_response_pct;
  if (after != null && after > 30) return insights;

  for (const tier of ['T1', 'T2', 'T3', 'T4']) {
    const s = doc.nps_by_tier?.[tier];
    if (s?.n >= MIN_INSIGHT_N && s.nps != null) {
      const t4 = doc.nps_by_tier?.T4;
      if (tier !== 'T4' && t4?.n >= MIN_INSIGHT_N && s.nps - t4.nps >= 20) {
        insights.push({
          text: `${tier} apresentou NPS maior que T4 no Set/2026 (associação, proxy financeiro).`,
          n: s.n,
          quality: cov.coverage_quality,
        });
        break;
      }
    }
  }

  const res = doc.resultados_x_reserve?.mann_whitney;
  if (
    res?.p_value != null &&
    res.p_value < 0.05 &&
    (doc.resultados_x_reserve?.n_negative ?? 0) >= MIN_CELL_N
  ) {
    insights.push({
      text: 'Distribuição de reserva difere entre Resultados negativo e demais (Mann-Whitney).',
      n: doc.resultados_x_reserve.n_negative,
      quality: cov.coverage_quality,
    });
  }

  return insights;
}

/**
 * @param {object} opts
 */
export function buildNpsFinancialProfileDoc(opts) {
  const {
    responses = [],
    responseTopics = [],
    milestoneEntries = [],
    financialByClient = new Map(),
    sourceForClient = (id) => (financialByClient.has(id) ? 'fallback_export' : 'missing'),
    cycleCode = SET_CYCLE_CODE,
    financialSource = 'merged',
    dataCutoff,
  } = opts;

  const setResponses = responses.filter(
    (r) =>
      r.program?.toUpperCase() === 'PHARUS' &&
      r.analytical_cycle_code === cycleCode &&
      r.client_id,
  );

  const milestoneByClient = new Map(
    milestoneEntries
      .filter((e) => e.analytical_cycle_code === cycleCode)
      .map((e) => [e.client_id, e]),
  );

  const entries = setResponses.map((r) => {
    const fin = financialByClient.get(r.client_id) ?? null;
    const src = sourceForClient(r.client_id);
    const entry = buildFinancialProfileEntry(r, fin, milestoneByClient.get(r.client_id), src);
    entry._raw_income = fin?.ultima_renda_mensal;
    entry._raw_contribution = fin?.ultimo_aporte;
    entry._raw_reserve = fin?.reserva_liquidez;
    return entry;
  });

  const sourceCounts = {
    raw_snapshot: entries.filter((e) => e.financial_source === 'raw_snapshot').length,
    fallback_export: entries.filter((e) => e.financial_source === 'fallback_export').length,
    missing: entries.filter((e) => e.financial_source === 'missing').length,
  };

  const coverage = buildFinancialProfileCoverage(entries, setResponses.length, sourceCounts);
  const invalidFromRaw = entries.reduce(
    (acc, e) => {
      const inc = parseFinancialNumeric(e._raw_income);
      const con = parseFinancialNumeric(e._raw_contribution);
      const res = parseFinancialNumeric(e._raw_reserve);
      if (inc.status === 'invalid') acc.invalid_income++;
      if (con.status === 'invalid') acc.invalid_contribution++;
      if (res.status === 'invalid') acc.invalid_reserve++;
      return acc;
    },
    { invalid_income: 0, invalid_contribution: 0, invalid_reserve: 0 },
  );
  coverage.invalid_income = invalidFromRaw.invalid_income;
  coverage.invalid_contribution = invalidFromRaw.invalid_contribution;
  coverage.invalid_reserve = invalidFromRaw.invalid_reserve;

  const temporalAfter = entries.filter((e) => e.financial_temporal_quality === 'current_proxy_after_response').length;
  coverage.temporal_after_response_n = temporalAfter;
  coverage.temporal_after_response_pct = entries.length ? (temporalAfter / entries.length) * 100 : null;

  const negIds = resultadosNegativeClientIds(responseTopics, responses, cycleCode);
  const tier1Entries = entries.filter((e) => e.tier === 'T1');
  const tierDistributionCheck = assertTierDistribution(coverage.tier_distribution, setResponses.length);

  const doc = {
    meta: {
      etapa: '4.7',
      program: 'PHARUS',
      cycle_code: cycleCode,
      generated_at: dataCutoff ?? new Date().toISOString(),
      tier_quality: 'current_proxy',
      aporte_semantics: 'ambiguous',
      financial_source: financialSource,
      methodology_note:
        'Tier derivado por renda/aporte/reserva. NULL≠0. Débitos separados. Set/2026 — não extrapolar como PIT histórico.',
    },
    entries,
    tier_t1_criteria_overlap: countT1CriteriaOverlap(tier1Entries),
    tier_distribution_check: tierDistributionCheck,
    financial_profile_coverage: coverage,
    nps_by_tier: buildNpsByTier(entries),
    debts_vs_nps: buildDebtsVsNps(entries),
    tier_debts_cross: buildTierDebtsCross(entries),
    resultados_x_tier: buildResultadosXTier(entries, negIds),
    resultados_x_reserve: buildResultadosXReserve(entries, negIds),
    resultados_x_contribution: buildResultadosXContribution(entries, negIds),
    resultados_x_debts: buildResultadosXDebts(entries, negIds),
    tier_x_mechanisms: buildTierXMechanisms(entries),
    resultados_x_tier_x_mechanisms: buildResultadosXTierXMechanisms(entries, negIds),
    limitations: [
      'Snapshot financeiro atual — não representa histórico perfeito na data da resposta.',
      'ultimo_aporte: semântica ambígua (ver QA aporte_semantics_warning).',
      'Jun–Jul: Tier não aplicado retroativamente como na época.',
      'Insights automáticos exigem cobertura ≥80%, n suficiente e qualidade temporal aceitável.',
    ],
  };

  doc.auto_insights = generateFinancialAutoInsights(doc);
  return doc;
}
