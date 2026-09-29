import { classifyNpsScore } from './nps.mjs';
import { mannWhitneyU, kruskalWallis } from './driver-stats.mjs';
import { mean, median, iqr, pctTrue } from './milestone-temporal.mjs';
import { proportionTest } from './nps-milestones-stats.mjs';

const EVOLUTION_BUCKETS = ['Melhora', 'Estável', 'Queda'];
const MIGRATION_LABELS = [
  'Promotor → Promotor',
  'Promotor → Neutro',
  'Promotor → Detrator',
  'Neutro → Promotor',
  'Neutro → Neutro',
  'Neutro → Detrator',
  'Detrator → Promotor',
  'Detrator → Neutro',
  'Detrator → Detrator',
];
const MEETING_METRICS = [
  { key: 'meetings_between', label: 'Reuniões entre ciclos' },
  { key: 'meetings_last_30d', label: 'Reuniões últimos 30d (até resposta)' },
  { key: 'meetings_last_90d', label: 'Reuniões últimos 90d (até resposta)' },
  { key: 'days_since_last_meeting_current', label: 'Dias desde última reunião' },
];

const MIN_INSIGHT_N = 8;
const MIN_CELL_N = 5;

export function evolutionBucket(evolutionStatus) {
  if (!evolutionStatus) return null;
  if (evolutionStatus === 'Grande melhora' || evolutionStatus === 'Melhora') return 'Melhora';
  if (evolutionStatus === 'Estável') return 'Estável';
  if (evolutionStatus === 'Queda' || evolutionStatus === 'Queda severa') return 'Queda';
  return null;
}

export function mechanismBucket(count) {
  if (count == null || Number.isNaN(count)) return null;
  if (count <= 0) return '0';
  if (count === 1) return '1';
  return '2+';
}

export function coverageQualityLabel(pct) {
  if (pct == null) return 'unknown';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'partial';
  return 'low';
}

function npsFromScores(scores) {
  const xs = scores.filter((s) => s != null && !Number.isNaN(s));
  if (!xs.length) return null;
  let prom = 0;
  let det = 0;
  for (const s of xs) {
    const cat = classifyNpsScore(s);
    if (cat === 'Promotor') prom++;
    else if (cat === 'Detrator') det++;
  }
  return ((prom / xs.length) * 100) - ((det / xs.length) * 100);
}

function pctDetractors(scores) {
  const xs = scores.filter((s) => s != null);
  if (!xs.length) return null;
  let det = 0;
  for (const s of xs) if (classifyNpsScore(s) === 'Detrator') det++;
  return (det / xs.length) * 100;
}

function numericSummary(rows, field) {
  const values = rows.map((r) => r[field]).filter((v) => v != null && !Number.isNaN(v));
  const { q1, q3, iqr: spread } = iqr(values);
  return {
    n: rows.length,
    n_with_value: values.length,
    mean: mean(values),
    median: median(values),
    q1,
    q3,
    iqr: spread,
  };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function normMigration(m) {
  return (m ?? '').replace(/\s->\s/g, ' → ').replace(/\s→\s/g, ' → ');
}

export function buildEvolutionGroupCounts(betweenEvents) {
  const rows = betweenEvents.map((e) => ({
    ...e,
    evolution_bucket: evolutionBucket(e.evolution_status),
  }));
  const out = {};
  for (const b of EVOLUTION_BUCKETS) {
    const g = rows.filter((r) => r.evolution_bucket === b);
    out[b] = { n: g.length };
  }
  return { rows, groups: out };
}

export function buildMigrationTransitionGroups(betweenEvents) {
  const groups = {};
  for (const label of MIGRATION_LABELS) {
    const g = betweenEvents.filter((r) => normMigration(r.migration) === normMigration(label));
    groups[label] = { n: g.length };
  }
  return groups;
}

export function buildMeetingsByGroup(betweenEvents, groupKey = 'evolution_bucket') {
  const enriched = betweenEvents.map((e) => ({
    ...e,
    evolution_bucket: evolutionBucket(e.evolution_status),
  }));
  const byGroup = groupBy(enriched, (r) => r[groupKey]);
  const tables = {};
  for (const [name, rows] of byGroup) {
    tables[name] = {};
    for (const { key, label } of MEETING_METRICS) {
      tables[name][key] = { label, ...numericSummary(rows, key) };
    }
  }
  return tables;
}

export function runMeetingsHypothesisTests(betweenEvents) {
  const rows = betweenEvents.map((e) => ({
    ...e,
    evolution_bucket: evolutionBucket(e.evolution_status),
  }));
  const queda = rows.filter((r) => r.evolution_bucket === 'Queda');
  const melhora = rows.filter((r) => r.evolution_bucket === 'Melhora');
  const allBuckets = EVOLUTION_BUCKETS.map((b) =>
    rows.filter((r) => r.evolution_bucket === b).map((r) => r.meetings_between).filter((v) => v != null),
  );

  return {
    H1_meetings_between_queda_vs_melhora: {
      hypothesis: 'Clientes que pioram têm menos reuniões entre os ciclos?',
      ...mannWhitneyU(
        queda.map((r) => r.meetings_between).filter((v) => v != null),
        melhora.map((r) => r.meetings_between).filter((v) => v != null),
      ),
      test: 'mann_whitney',
      n_queda: queda.length,
      n_melhora: melhora.length,
    },
    H2_days_since_last_queda_vs_melhora: {
      hypothesis: 'Clientes que pioram passam mais tempo desde a última reunião?',
      ...mannWhitneyU(
        queda.map((r) => r.days_since_last_meeting_current).filter((v) => v != null),
        melhora.map((r) => r.days_since_last_meeting_current).filter((v) => v != null),
      ),
      test: 'mann_whitney',
      n_queda: queda.length,
      n_melhora: melhora.length,
    },
    meetings_between_kruskal_evolution: {
      ...kruskalWallis(allBuckets),
      test: 'kruskal_wallis',
      groups: EVOLUTION_BUCKETS,
    },
  };
}

function mechanismOutcomeRow(rows) {
  const scores = rows.map((r) => r.current_score);
  const deltas = rows.map((r) => r.score_delta).filter((v) => v != null);
  return {
    n: rows.length,
    nps: npsFromScores(scores),
    mean_score: mean(scores),
    pct_detractors: pctDetractors(scores),
    mean_delta: mean(deltas),
  };
}

export function buildMechanismsAnalysis(betweenEvents) {
  const withBucket = betweenEvents.map((e) => ({
    ...e,
    mechanism_bucket: mechanismBucket(e.mechanisms_count_before_response),
    evolution_bucket: evolutionBucket(e.evolution_status),
  }));

  const byCount = {};
  for (const b of ['0', '1', '2+']) {
    byCount[b] = mechanismOutcomeRow(withBucket.filter((r) => r.mechanism_bucket === b));
  }

  const addedTrue = withBucket.filter((r) => r.mechanism_added_between_cycles === true);
  const addedFalse = withBucket.filter((r) => r.mechanism_added_between_cycles === false);

  const melhora = withBucket.filter((r) => r.evolution_bucket === 'Melhora');
  const queda = withBucket.filter((r) => r.evolution_bucket === 'Queda');

  return {
    by_mechanism_count_before_response: byCount,
    mechanism_added_between_cycles: {
      true: mechanismOutcomeRow(addedTrue),
      false: mechanismOutcomeRow(addedFalse),
    },
    H5_added_vs_improvement: {
      hypothesis: 'Implementação de mecanismo entre ciclos está associada a melhora?',
      ...proportionTest(melhora, queda, (r) => r.mechanism_added_between_cycles === true),
    },
    H3_mechanism_count_kruskal_score: {
      hypothesis: 'Contagem de mecanismos antes da resposta associa-se à nota atual?',
      ...kruskalWallis(
        ['0', '1', '2+'].map((b) =>
          withBucket.filter((r) => r.mechanism_bucket === b).map((r) => r.current_score),
        ),
      ),
      test: 'kruskal_wallis',
    },
    H4_two_plus_vs_rest: {
      hypothesis: 'Clientes com 2+ mecanismos têm comportamento diferente de 0/1?',
      ...mannWhitneyU(
        withBucket.filter((r) => r.mechanism_bucket === '2+').map((r) => r.current_score),
        withBucket.filter((r) => r.mechanism_bucket === '0' || r.mechanism_bucket === '1').map((r) => r.current_score),
      ),
      test: 'mann_whitney',
    },
  };
}

export function buildEpChangeAnalysis(betweenEvents) {
  const changed = betweenEvents.filter((r) => r.ep_changed === true);
  const stable = betweenEvents.filter((r) => r.ep_changed === false);
  const pctWorse = (rows) =>
    rows.length ? pctTrue(rows, (r) => (r.score_delta ?? 0) < 0) : null;
  const pctRecover = (rows) =>
    rows.length
      ? pctTrue(rows, (r) => {
          const prev = classifyNpsScore(r.previous_score);
          const curr = classifyNpsScore(r.current_score);
          return prev === 'Detrator' && (curr === 'Neutro' || curr === 'Promotor');
        })
      : null;

  const queda = betweenEvents.filter((r) => evolutionBucket(r.evolution_status) === 'Queda');
  const rest = betweenEvents.filter((r) => evolutionBucket(r.evolution_status) !== 'Queda');

  return {
    changed_ep_between_cycles: {
      true: {
        n: changed.length,
        mean_delta: mean(changed.map((r) => r.score_delta).filter((v) => v != null)),
        pct_worse: pctWorse(changed),
        pct_recovery: pctRecover(changed),
      },
      false: {
        n: stable.length,
        mean_delta: mean(stable.map((r) => r.score_delta).filter((v) => v != null)),
        pct_worse: pctWorse(stable),
        pct_recovery: pctRecover(stable),
      },
    },
    H6_ep_change_vs_decline: {
      hypothesis: 'Troca de EP entre ciclos associa-se a deterioração?',
      ...proportionTest(queda, rest, (r) => r.ep_changed === true),
    },
  };
}

export function buildChurnAnalysis(betweenEvents, churnSourceComplete) {
  const withChurn = betweenEvents.filter((r) => r.churn_requested_before_response != null);
  const coveragePct = betweenEvents.length
    ? (withChurn.length / betweenEvents.length) * 100
    : null;

  const base = {
    quality: churnSourceComplete && coverageQualityLabel(coveragePct) === 'good' ? 'complete' : 'partial',
    coverage_pct: coveragePct,
    show_managerial_conclusion: churnSourceComplete && coveragePct >= 80,
  };

  if (!withChurn.length) {
    return { ...base, by_churn_requested: null, note: 'Sem cobertura de churn no ciclo pareado.' };
  }

  const yes = withChurn.filter((r) => r.churn_requested_before_response === true);
  const no = withChurn.filter((r) => r.churn_requested_before_response === false);

  return {
    ...base,
    by_churn_requested: {
      requested: {
        n: yes.length,
        nps: npsFromScores(yes.map((r) => r.current_score)),
        mean_delta: mean(yes.map((r) => r.score_delta).filter((v) => v != null)),
      },
      not_requested: {
        n: no.length,
        nps: npsFromScores(no.map((r) => r.current_score)),
        mean_delta: mean(no.map((r) => r.score_delta).filter((v) => v != null)),
      },
    },
    H7_churn_vs_nps: {
      hypothesis: 'Pedido de churn antes da resposta associa-se a NPS menor?',
      ...mannWhitneyU(
        yes.map((r) => r.current_score),
        no.map((r) => r.current_score),
      ),
      test: 'mann_whitney',
    },
  };
}

function responseHasNegativeTopic(responseTopics, responseId, topic) {
  return responseTopics.some(
    (t) =>
      t.response_id === responseId &&
      t.topic === topic &&
      t.valence === 'Negativa',
  );
}

export function buildResultadosMechanismsInsight(
  milestoneEntries,
  responseTopics,
  responsesById,
  currentCycle,
) {
  const pharusCurrent = milestoneEntries.filter((e) => e.analytical_cycle_code === currentCycle);
  const withTopic = [];
  const withoutTopic = [];

  for (const e of pharusCurrent) {
    const resp = responsesById.get(e.response_id) ?? responsesById.get(`${e.client_id}::${e.analytical_cycle_code}`);
    const responseId = resp?.response_id ?? e.response_id;
    if (!responseId) continue;
    const neg = responseHasNegativeTopic(responseTopics, responseId, 'Resultados');
    const row = {
      mechanisms_count_before_response: e.mechanisms_count_before_response,
      mechanism_bucket: mechanismBucket(e.mechanisms_count_before_response),
      score: e.score,
      nps_category: e.nps_category,
    };
    if (neg) withTopic.push(row);
    else withoutTopic.push(row);
  }

  function distrib(rows) {
    const n = rows.length;
    if (!n) return { n: 0 };
    const counts = rows.map((r) => r.mechanisms_count_before_response ?? 0);
    return {
      n,
      median_mechanisms: median(counts),
      pct_no_mechanism: pctTrue(rows, (r) => (r.mechanisms_count_before_response ?? 0) === 0),
      pct_one: pctTrue(rows, (r) => r.mechanisms_count_before_response === 1),
      pct_two_plus: pctTrue(rows, (r) => (r.mechanisms_count_before_response ?? 0) >= 2),
      nps: npsFromScores(rows.map((r) => r.score)),
      mean_score: mean(rows.map((r) => r.score)),
    };
  }

  return {
    question:
      'Clientes que reclamam de resultados têm menos mecanismos implementados?',
    resultados_negative: distrib(withTopic),
    others: distrib(withoutTopic),
    comparison: mannWhitneyU(
      withTopic.map((r) => r.mechanisms_count_before_response ?? 0),
      withoutTopic.map((r) => r.mechanisms_count_before_response ?? 0),
    ),
  };
}

export function buildTopicOperationalCrosses(betweenEvents, responseTopics, currentCycle) {
  const crosses = [];
  const specs = [
    { topic: 'Resultados', metric: 'mechanisms_count_before_response', field: 'mechanisms_count_before_response' },
    { topic: 'Agilidade', metric: 'days_since_last_meeting', field: 'days_since_last_meeting_current' },
    { topic: 'Atendimento / relacionamento', metric: 'ep_changed', field: 'ep_changed' },
    { topic: 'Oportunidades', metric: 'mechanisms_count_before_response', field: 'mechanisms_count_before_response' },
  ];

  const cycleRows = betweenEvents.filter((e) => e.current_cycle === currentCycle);
  const topicNegByClient = new Map();
  for (const t of responseTopics) {
    if (t.analytical_cycle_code !== currentCycle || t.valence !== 'Negativa') continue;
    const key = `${t.client_id}::${t.topic}`;
    topicNegByClient.set(key, true);
  }

  for (const spec of specs) {
    const neg = cycleRows.filter((r) => topicNegByClient.has(`${r.client_id}::${spec.topic}`));
    const rest = cycleRows.filter((r) => !topicNegByClient.has(`${r.client_id}::${spec.topic}`));
    if (neg.length < MIN_CELL_N || rest.length < MIN_CELL_N) {
      crosses.push({
        topic: spec.topic,
        metric: spec.metric,
        shown: false,
        reason: 'n_insufficient',
        n_negative: neg.length,
        n_rest: rest.length,
      });
      continue;
    }
    const field = spec.field;
    let comparison;
    if (field === 'ep_changed') {
      comparison = {
        pct_true_negative: pctTrue(neg, (r) => r.ep_changed === true),
        pct_true_rest: pctTrue(rest, (r) => r.ep_changed === true),
        ...proportionTest(neg, rest, (r) => r.ep_changed === true),
      };
    } else {
      comparison = {
        median_negative: median(neg.map((r) => r[field]).filter((v) => v != null)),
        median_rest: median(rest.map((r) => r[field]).filter((v) => v != null)),
        ...mannWhitneyU(
          neg.map((r) => r[field]).filter((v) => v != null),
          rest.map((r) => r[field]).filter((v) => v != null),
        ),
      };
    }
    crosses.push({
      topic: spec.topic,
      metric: spec.metric,
      shown: true,
      n_negative: neg.length,
      n_rest: rest.length,
      comparison,
    });
  }
  return crosses;
}

export function computeFieldCoverage(betweenEvents) {
  const n = betweenEvents.length || 1;
  const fieldPct = (pred) => (betweenEvents.filter(pred).length / n) * 100;
  return {
    meetings_between: fieldPct((r) => r.meetings_between != null),
    days_since_last_meeting: fieldPct((r) => r.days_since_last_meeting_current != null),
    mechanisms_before_response: fieldPct((r) => r.mechanisms_count_before_response != null),
    mechanism_added_between: fieldPct((r) => r.mechanism_added_between_cycles != null),
    ep_changed: fieldPct((r) => r.ep_changed != null),
    churn: fieldPct((r) => r.churn_requested_before_response != null),
    evolution_status: fieldPct((r) => r.evolution_status != null),
  };
}

export function inferChurnSourceComplete(sourcesLoaded, expectedMin = 45) {
  const n = sourcesLoaded?.['cancellations.json'] ?? 0;
  return n >= expectedMin;
}

export function generateAutoInsights(doc) {
  const insights = [];
  const cov = doc.coverage?.fields ?? {};
  const q = (k) => cov[k]?.quality ?? coverageQualityLabel(cov[k]?.pct);

  const mech = doc.mechanisms?.by_mechanism_count_before_response?.['2+'];
  if (mech?.n >= MIN_INSIGHT_N && q('mechanisms_before_response') !== 'low') {
    const zero = doc.mechanisms.by_mechanism_count_before_response['0'];
    if (mech.nps != null && zero?.nps != null && mech.nps - zero.nps >= 15) {
      insights.push({
        text: 'Clientes com 2+ mecanismos antes da resposta apresentaram NPS maior no ciclo atual (base pareada).',
        quality: q('mechanisms_before_response'),
        n: mech.n,
      });
    }
  }

  const h1 = doc.meetings?.tests?.H1_meetings_between_queda_vs_melhora;
  if (
    h1?.p_value != null &&
    h1.p_value < 0.05 &&
    h1.median_a != null &&
    h1.median_b != null &&
    h1.n_queda >= MIN_CELL_N &&
    h1.n_melhora >= MIN_CELL_N &&
    q('meetings_between') !== 'low'
  ) {
    insights.push({
      text: 'Entre queda e melhora de evolução, observou-se diferença na mediana de reuniões entre ciclos (associação estatística, não causal).',
      quality: q('meetings_between'),
      n: (h1.n ?? 0),
    });
  }

  const h5 = doc.mechanisms?.H5_added_vs_improvement;
  if (
    h5?.p_value != null &&
    h5.p_value < 0.05 &&
    (h5.n_a ?? 0) >= MIN_CELL_N &&
    (h5.n_b ?? 0) >= MIN_CELL_N &&
    q('mechanism_added_between') !== 'low'
  ) {
    insights.push({
      text: 'A proporção de mecanismos adicionados entre ciclos difere entre clientes com melhora e com queda.',
      quality: q('mechanism_added_between'),
      n: (h5.n_a ?? 0) + (h5.n_b ?? 0),
    });
  }

  return insights;
}

/**
 * @param {object} opts
 * @param {Array} opts.betweenEvents
 * @param {Array} opts.milestoneEntries
 * @param {Array} opts.responseTopics
 * @param {Array} opts.responses
 * @param {string} opts.currentCycle
 * @param {object} opts.sourcesLoaded
 */
export function buildNpsChangeDriversDoc(opts) {
  const {
    betweenEvents = [],
    milestoneEntries = [],
    responseTopics = [],
    responses = [],
    currentCycle,
    sourcesLoaded = {},
    milestoneCoverage = {},
  } = opts;

  const paired = betweenEvents.filter((e) => e.current_cycle === currentCycle);
  const { groups: evolutionGroups } = buildEvolutionGroupCounts(paired);
  const migrationGroups = buildMigrationTransitionGroups(paired);
  const meetingsByEvolution = buildMeetingsByGroup(paired, 'evolution_bucket');
  const meetingsByMigration = buildMeetingsByGroup(
    paired.map((e) => ({ ...e, migration_label: normMigration(e.migration) })),
    'migration_label',
  );
  const meetingTests = runMeetingsHypothesisTests(paired);
  const mechanisms = buildMechanismsAnalysis(paired);
  const epChange = buildEpChangeAnalysis(paired);
  const churnComplete = inferChurnSourceComplete(sourcesLoaded);
  const churn = buildChurnAnalysis(paired, churnComplete);

  const responsesById = new Map();
  for (const r of responses) {
    if (r.response_id) responsesById.set(r.response_id, r);
    responsesById.set(`${r.client_id}::${r.analytical_cycle_code}`, r);
  }

  const currentMilestones = milestoneEntries.filter((e) => e.analytical_cycle_code === currentCycle);
  const resultadosInsight = buildResultadosMechanismsInsight(
    currentMilestones.map((e) => {
      const resp = responsesById.get(`${e.client_id}::${e.analytical_cycle_code}`);
      return { ...e, response_id: resp?.response_id };
    }),
    responseTopics,
    responsesById,
    currentCycle,
  );

  const topicCrosses = buildTopicOperationalCrosses(paired, responseTopics, currentCycle);
  const fieldCoverage = computeFieldCoverage(paired);
  const coverage = {
    fields: Object.fromEntries(
      Object.entries(fieldCoverage).map(([k, pct]) => [k, { pct, quality: coverageQualityLabel(pct) }]),
    ),
    milestone_by_field: milestoneCoverage,
  };

  const doc = {
    meta: {
      program: 'PHARUS',
      current_cycle: currentCycle,
      paired_transitions: paired.length,
      methodology_note:
        'Associações observadas na base pareada. Sem inferência causal. Marcos com event_at <= submitted_at.',
      generated_at: opts.dataCutoff ?? new Date().toISOString(),
    },
    evolution_groups: evolutionGroups,
    migration_groups: migrationGroups,
    meetings: {
      by_evolution: meetingsByEvolution,
      by_migration: meetingsByMigration,
      tests: meetingTests,
    },
    mechanisms,
    ep_change: epChange,
    churn,
    topic_operational_crosses: topicCrosses,
    resultados_mechanisms: resultadosInsight,
    coverage,
    limitations: [
      'Resultados descrevem coocorrência na população pareada, não efeito de intervenções.',
      churnComplete
        ? null
        : 'Fonte de cancelamentos incompleta — bloco churn com quality partial; sem conclusão gerencial.',
      fieldCoverage.meetings_between < 50
        ? 'Cobertura de reuniões entre ciclos limitada — interpretar reuniões com cautela.'
        : null,
    ].filter(Boolean),
  };

  doc.auto_insights = generateAutoInsights(doc);
  return doc;
}
