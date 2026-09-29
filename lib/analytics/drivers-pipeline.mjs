import {
  spearmanRho,
  chiSquareWithCramersV,
  mannWhitneyU,
  kruskalWallis,
  benjaminiHochberg,
  effectLabel,
  logisticRegression,
} from './driver-stats.mjs';
import {
  MIN_N_SPEARMAN,
  MIN_N_CHISQ,
  MIN_N_MANN_WHITNEY,
  MIN_N_LOGISTIC,
  MAX_LOGISTIC_PREDICTORS,
  MIN_FEATURE_COVERAGE,
  relevanceScore,
  RELEVANCE_FORMULA_DOC,
  FDR_ALPHA,
} from './driver-config.mjs';
import { buildDriverFeatures, averageFeatureCoverage } from './driver-features.mjs';
import { buildCommentDrivers } from './comment-drivers.mjs';

const NUMERIC_DRIVERS = [
  { id: 'meetings_count', field: 'meetings_count', qualityField: 'meetings' },
  { id: 'meetings_last_90d', field: 'meetings_last_90d', qualityField: 'meetings' },
  { id: 'days_since_last_meeting', field: 'days_since_last_meeting', qualityField: 'meetings' },
  { id: 'tenure_months', field: 'tenure_months', qualityField: 'tenure' },
  { id: 'csat_average', field: 'csat_average', qualityField: 'csat' },
  { id: 'positive_topics_count', field: 'positive_topics_count', qualityField: 'partial' },
  { id: 'negative_topics_count', field: 'negative_topics_count', qualityField: 'partial' },
  { id: 'mechanisms_count', field: 'mechanisms_count', qualityField: 'mechanisms' },
];

const CATEGORICAL_DRIVERS = [
  { id: 'ep_name', field: 'ep_name', qualityField: 'ep' },
  { id: 'journey_stage', field: 'journey_stage', qualityField: 'partial' },
  { id: 'engagement_status', field: 'engagement_status', qualityField: 'engagement' },
  { id: 'nps_category', field: 'nps_category', qualityField: 'point_in_time' },
];

const BINARY_DRIVERS = [
  { id: 'has_csat', field: 'has_csat', qualityField: 'csat' },
  { id: 'has_mechanism', field: 'has_mechanism', qualityField: 'mechanisms' },
  { id: 'is_detractor', field: 'is_detractor', qualityField: 'point_in_time' },
];

function filterUniverse(features, universe, cycleCode) {
  let rows = features.filter((f) => f.analytical_cycle_code === cycleCode);
  if (universe === 'paired') rows = rows.filter((f) => f.is_paired && f.score_delta != null);
  return rows;
}

function pushTest(out, base) {
  out.push(base);
  return out;
}

function runNumericTests(features, cycleCode, universe, outcome) {
  const tests = [];
  const rows = filterUniverse(features, universe, cycleCode);
  for (const d of NUMERIC_DRIVERS) {
    const cov = averageFeatureCoverage(rows, d.field);
    if (cov < MIN_FEATURE_COVERAGE) continue;
    const xs = [];
    const ys = [];
    for (const r of rows) {
      const y =
        outcome === 'score'
          ? r.score
          : outcome === 'score_delta'
            ? r.score_delta
            : outcome === 'deteriorated'
              ? (r.deteriorated ? 1 : 0)
              : null;
      if (y == null || r[d.field] == null) continue;
      xs.push(Number(r[d.field]));
      ys.push(Number(y));
    }
    if (outcome === 'deteriorated') {
      const xs2 = [];
      const ys2 = [];
      for (const r of rows) {
        if (r[d.field] == null) continue;
        xs2.push(Number(r[d.field]));
        ys2.push(r.deteriorated ? 1 : 0);
      }
      const resD = spearmanRho(xs2, ys2);
      if ((resD.n ?? 0) < MIN_N_SPEARMAN) continue;
      pushTest(tests, {
        cycle_code: cycleCode,
        universe,
        driver: d.id,
        driver_type: 'numeric',
        outcome: 'deteriorated',
        method: 'spearman',
        n: resD.n,
        effect_size: resD.rho,
        effect_label: effectLabel(resD.rho, 'spearman'),
        statistic: resD.rho,
        p_value_raw: resD.p_value,
        ci_low: resD.ci_low,
        ci_high: resD.ci_high,
        feature_quality: rows[0]?.feature_quality?.[d.qualityField] ?? 'partial',
        limitations: [],
        reading_hint: null,
      });
      continue;
    }
    const res = spearmanRho(xs, ys);
    if ((res.n ?? 0) < MIN_N_SPEARMAN) continue;
    const q = rows[0]?.feature_quality?.[d.qualityField] ?? 'partial';
    pushTest(tests, {
      cycle_code: cycleCode,
      universe,
      driver: d.id,
      driver_type: 'numeric',
      outcome,
      method: 'spearman',
      n: res.n,
      effect_size: res.rho,
      effect_label: effectLabel(res.rho, 'spearman'),
      statistic: res.rho,
      p_value_raw: res.p_value,
      ci_low: res.ci_low,
      ci_high: res.ci_high,
      feature_quality: q,
      limitations: [],
      reading_hint: null,
    });
  }
  return tests;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function runCategoricalVsCategory(features, cycleCode, universe) {
  const tests = [];
  const rows = filterUniverse(features, universe, cycleCode);
  for (const d of CATEGORICAL_DRIVERS) {
    if (d.id === 'nps_category') continue;
    const cov = averageFeatureCoverage(rows, d.field);
    if (cov < MIN_FEATURE_COVERAGE) continue;
    const categories = [...new Set(rows.map((r) => r[d.field]).filter(Boolean))];
    const npsCats = ['Detrator', 'Neutro', 'Promotor'];
    if (categories.length < 2) continue;
    const table = categories.map(() => npsCats.map(() => 0));
    for (const r of rows) {
      const ri = categories.indexOf(r[d.field]);
      const ci = npsCats.indexOf(r.nps_category);
      if (ri >= 0 && ci >= 0) table[ri][ci]++;
    }
    const res = chiSquareWithCramersV(categories.length, npsCats.length, table);
    if ((res.n ?? 0) < MIN_N_CHISQ) continue;
    pushTest(tests, {
      cycle_code: cycleCode,
      universe,
      driver: d.id,
      driver_type: 'categorical',
      outcome: 'nps_category',
      method: 'chi_square',
      n: res.n,
      effect_size: res.effect_size,
      effect_label: effectLabel(res.effect_size, 'cramers'),
      statistic: res.statistic,
      p_value_raw: res.p_value,
      feature_quality: rows[0]?.feature_quality?.[d.qualityField] ?? 'partial',
      limitations: res.limitation ? [res.limitation] : [],
      reading_hint: null,
    });
  }
  return tests;
}

function runBinaryOutcomeTests(features, cycleCode, universe) {
  const tests = [];
  const rows = filterUniverse(features, universe, cycleCode);
  for (const d of BINARY_DRIVERS) {
    if (d.id === 'is_detractor') continue;
    const a = [];
    const b = [];
    for (const r of rows) {
      if (r[d.field] == null) continue;
      if (r[d.field]) a.push(r.score);
      else b.push(r.score);
    }
    if (a.length < MIN_N_MANN_WHITNEY || b.length < MIN_N_MANN_WHITNEY) continue;
    const mw = mannWhitneyU(a, b);
    pushTest(tests, {
      cycle_code: cycleCode,
      universe,
      driver: d.id,
      driver_type: 'binary',
      outcome: 'score_by_group',
      method: 'mann_whitney',
      n: mw.n,
      effect_size: mw.effect_size,
      effect_label: effectLabel(mw.effect_size, 'biserial'),
      statistic: mw.u,
      p_value_raw: mw.p_value,
      median_group_a: mw.median_a,
      median_group_b: mw.median_b,
      difference: mw.difference,
      feature_quality: rows[0]?.feature_quality?.[d.qualityField] ?? 'partial',
      limitations: [],
      reading_hint: null,
    });
  }
  return tests;
}

function runDetractorBinary(features, cycleCode, universe) {
  const tests = [];
  const rows = filterUniverse(features, universe, cycleCode);
  for (const d of NUMERIC_DRIVERS) {
    const cov = averageFeatureCoverage(rows, d.field);
    if (cov < MIN_FEATURE_COVERAGE) continue;
    const det = [];
    const non = [];
    for (const r of rows) {
      if (r[d.field] == null) continue;
      if (r.is_detractor) det.push(Number(r[d.field]));
      else non.push(Number(r[d.field]));
    }
    if (det.length < 5 || non.length < 5) continue;
    const mw = mannWhitneyU(det, non);
    pushTest(tests, {
      cycle_code: cycleCode,
      universe,
      driver: d.id,
      driver_type: 'numeric',
      outcome: 'is_detractor',
      method: 'mann_whitney',
      n: mw.n,
      effect_size: mw.effect_size,
      effect_label: effectLabel(mw.effect_size, 'biserial'),
      statistic: mw.u,
      p_value_raw: mw.p_value,
      feature_quality: rows[0]?.feature_quality?.[d.qualityField] ?? 'partial',
      limitations: [],
      reading_hint: null,
    });
  }
  return tests;
}

function applyFdr(tests) {
  const adj = benjaminiHochberg(tests);
  return tests.map((t, i) => ({
    ...t,
    p_value_adjusted: adj[i].p_value_adjusted,
    significant_fdr_05: adj[i].significant_fdr_05,
  }));
}

function buildReading(test) {
  const dir = (test.effect_size ?? 0) >= 0 ? 'mais alta' : 'mais baixa';
  if (test.method === 'spearman' && test.outcome === 'score') {
    return `Maior ${test.driver} associado a notas ${dir} na amostra (${test.universe}).`;
  }
  if (test.method === 'mann_whitney' && test.outcome === 'is_detractor') {
    return `Distribuição de ${test.driver} difere entre detratores e não detratores (associação observada).`;
  }
  if (test.method === 'chi_square') {
    return `${test.driver} relacionado à composição de categorias NPS (qui-quadrado).`;
  }
  return `Associação observada entre ${test.driver} e ${test.outcome}.`;
}

function runLogistic(features, cycleCode) {
  const rows = filterUniverse(features, 'cycle', cycleCode);
  if (rows.length < MIN_N_LOGISTIC) return null;
  const preds = ['has_csat', 'has_mechanism', 'meetings_count', 'csat_average'].filter(
    (f) => averageFeatureCoverage(rows, f) >= MIN_FEATURE_COVERAGE,
  );
  if (!preds.length) return null;
  const X = rows.map((r) => [
    1,
    ...preds.map((p) => {
      const v = r[p];
      if (typeof v === 'boolean') return v ? 1 : 0;
      return Number(v) || 0;
    }),
  ]);
  const y = rows.map((r) => (r.is_detractor ? 1 : 0));
  const model = logisticRegression(X, y);
  if (!model.rows) return null;
  return {
    cycle_code: cycleCode,
    outcome: 'is_detractor',
    method: 'logistic_regression',
    n: model.n,
    predictors: preds,
    coefficients: model.rows.map((row, idx) => ({
      feature: preds[idx],
      ...row,
    })),
    note: 'Associação multivariada — não implica causalidade.',
  };
}

export function buildDriversArtifacts({
  responses,
  csatResponses,
  responseTopics,
  clientsById,
  meetings,
  mechanisms,
  cycles,
  dataCutoff,
  pairedDoc,
}) {
  const features = buildDriverFeatures(responses, {
    csatResponses,
    responseTopics,
    clientsById,
    meetings,
    mechanisms,
  });

  const cycleCodes = (cycles ?? []).map((c) => c.cycle_code).filter(Boolean);
  const universes = ['cycle', 'paired'];
  let allTests = [];

  for (const code of cycleCodes) {
    for (const u of universes) {
      if (u === 'paired' && code !== pairedDoc?.current_cycle) continue;
      allTests = allTests.concat(runNumericTests(features, code, u, 'score'));
      if (u === 'paired') {
        allTests = allTests.concat(runNumericTests(features, code, u, 'score_delta'));
        allTests = allTests.concat(runNumericTests(features, code, u, 'deteriorated'));
      }
      allTests = allTests.concat(runCategoricalVsCategory(features, code, u));
      allTests = allTests.concat(runBinaryOutcomeTests(features, code, u));
      allTests = allTests.concat(runDetractorBinary(features, code, u));
    }
  }

  allTests = applyFdr(allTests);
  for (const t of allTests) t.reading_hint = buildReading(t);

  const nMax = Math.max(...allTests.map((t) => t.n ?? 0), 1);
  const summaryEntries = allTests.map((t) => ({
    ...t,
    relevance_score: relevanceScore({
      effect_size: t.effect_size,
      n: t.n,
      nMax,
      qualityWeight: t.feature_quality === 'point_in_time' ? 1 : t.feature_quality === 'current_proxy' ? 0.85 : 0.7,
      significantFdr: t.significant_fdr_05,
    }),
  }));
  summaryEntries.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

  const commentDrivers = [];
  for (const code of cycleCodes) {
    commentDrivers.push(...buildCommentDrivers(responses, responseTopics, code, 'cycle'));
    if (code === pairedDoc?.current_cycle) {
      commentDrivers.push(...buildCommentDrivers(responses, responseTopics, code, 'paired'));
    }
  }

  const logisticModels = [];
  for (const code of cycleCodes) {
    const m = runLogistic(features, code);
    if (m) logisticModels.push(m);
  }

  const coverage = {};
  for (const f of NUMERIC_DRIVERS) {
    coverage[f.id] = averageFeatureCoverage(features, f.field);
  }

  const driversSummary = {
    data_cutoff: dataCutoff,
    relevance_formula: RELEVANCE_FORMULA_DOC,
    fdr_alpha: FDR_ALPHA,
    universes: {
      cycle: 'Respostas válidas no ciclo analítico',
      paired: 'Clientes com resposta nos dois ciclos consecutivos',
    },
    deterioration_definition:
      'score_delta < 0 ou migração NPS classificada como queda (Promotor/Neutro → categoria inferior).',
    feature_coverage: coverage,
    tests_count: allTests.length,
    significant_fdr_count: allTests.filter((t) => t.significant_fdr_05).length,
    average_feature_coverage:
      Object.values(coverage).reduce((a, b) => a + b, 0) / Math.max(Object.keys(coverage).length, 1),
    logistic_models: logisticModels,
    entries: summaryEntries.slice(0, 100),
    interpretation:
      'Resultados descrevem associações observadas na amostra. Não implicam causalidade nem explicam sozinhos o NPS.',
  };

  return {
    driver_features: features,
    driver_tests: allTests,
    drivers_summary: driversSummary,
    comment_drivers: commentDrivers,
  };
}
