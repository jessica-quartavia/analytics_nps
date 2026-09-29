import { chiSquareWithCramersV, mannWhitneyU, kruskalWallis, benjaminiHochberg } from './driver-stats.mjs';
import { mean, median, pctTrue } from './milestone-temporal.mjs';
import {
  countMeetingsStrictlyBetween,
  countMechanismsStrictlyBetween,
} from './nps-milestones.mjs';

const MIN_EP_SAMPLE = 5;

/** Fisher exact 2×2 (two-sided aproximação). */
export function fisherExact2x2(a, b, c, d) {
  const n = a + b + c + d;
  if (n === 0) return { p_value: null, n: 0 };
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;

  function hypergeom(x, r, c, n) {
    return (
      comb(c, x) *
      comb(n - c, r - x) /
      comb(n, r)
    );
  }

  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  }

  const obs = hypergeom(a, row1, col1, n);
  let p = 0;
  const maxA = Math.min(row1, col1);
  for (let i = 0; i <= maxA; i++) {
    const ai = i;
    const bi = row1 - i;
    const ci = col1 - i;
    const di = row2 - ci;
    if (bi < 0 || ci < 0 || di < 0) continue;
    const pr = hypergeom(ai, row1, col1, n);
    if (pr <= obs + 1e-12) p += pr;
  }
  return { p_value: Math.min(1, p), n };
}

export function proportionTest(groupA, groupB, predicate) {
  const aYes = groupA.filter(predicate).length;
  const bYes = groupB.filter(predicate).length;
  const aNo = groupA.length - aYes;
  const bNo = groupB.length - bYes;
  const n = groupA.length + groupB.length;
  if (n < 4) {
    return {
      n_a: groupA.length,
      n_b: groupB.length,
      pct_a: groupA.length ? (aYes / groupA.length) * 100 : null,
      pct_b: groupB.length ? (bYes / groupB.length) * 100 : null,
      p_value: null,
      effect_size: null,
      test: 'insufficient_n',
    };
  }
  let result;
  if (Math.min(aYes, aNo, bYes, bNo) < 5) {
    const fisher = fisherExact2x2(aYes, aNo, bYes, bNo);
    result = { ...fisher, test: 'fisher' };
  } else {
    const chi = chiSquareWithCramersV(2, 2, [
      [aYes, aNo],
      [bYes, bNo],
    ]);
    result = {
      p_value: chi.p_value,
      effect_size: chi.effect_size,
      test: 'chi_square',
      limitation: chi.limitation,
    };
  }
  return {
    n_a: groupA.length,
    n_b: groupB.length,
    pct_a: groupA.length ? (aYes / groupA.length) * 100 : null,
    pct_b: groupB.length ? (bYes / groupB.length) * 100 : null,
    ...result,
  };
}

export function buildMigrationComparison(betweenEvents, migrationA, migrationB, minSample = MIN_EP_SAMPLE) {
  const norm = (m) => (m ?? '').replace(/\s→\s/g, ' → ');
  const a = betweenEvents.filter((e) => norm(e.migration) === norm(migrationA));
  const b = betweenEvents.filter((e) => norm(e.migration) === norm(migrationB));
  const smallSample = a.length < minSample || b.length < minSample;

  const metrics = [
    {
      metric_key: 'ep_changed',
      label: 'Trocou EP entre ciclos',
      ...proportionTest(a, b, (r) => r.ep_changed === true),
    },
    {
      metric_key: 'meetings_between',
      label: 'Reuniões entre respostas (média)',
      ...mannWhitneyMeetings(a, b),
    },
    {
      metric_key: 'days_since_last_meeting',
      label: 'Dias desde última reunião (resposta atual)',
      ...mannWhitneyDaysSince(a, b),
    },
  ];

  return {
    migration_a: migrationA,
    migration_b: migrationB,
    n_a: a.length,
    n_b: b.length,
    small_sample: smallSample,
    metrics,
    cohort_a: a,
    cohort_b: b,
  };
}

function mannWhitneyMeetings(a, b) {
  const xs = a.map((r) => r.meetings_between).filter((v) => v != null);
  const ys = b.map((r) => r.meetings_between).filter((v) => v != null);
  const mw = mannWhitneyU(xs, ys);
  return {
    test: 'mann_whitney',
    mean_a: mean(xs),
    mean_b: mean(ys),
    median_a: median(xs),
    median_b: median(ys),
    p_value: mw.p_value,
    effect_size: mw.effect_size,
    n_a: xs.length,
    n_b: ys.length,
  };
}

function mannWhitneyDaysSince(a, b) {
  const xs = a.map((r) => r.days_since_last_meeting_current).filter((v) => v != null);
  const ys = b.map((r) => r.days_since_last_meeting_current).filter((v) => v != null);
  const mw = mannWhitneyU(xs, ys);
  return {
    test: 'mann_whitney',
    mean_a: mean(xs),
    mean_b: mean(ys),
    median_a: median(xs),
    median_b: median(ys),
    p_value: mw.p_value,
    effect_size: mw.effect_size,
    n_a: xs.length,
    n_b: ys.length,
  };
}

export function enrichBetweenEventsWithMilestoneRows(betweenEvents, milestoneEntries, sourceBundle = {}) {
  const { meetings = [], mechanisms = [] } = sourceBundle;
  const byKey = new Map(
    milestoneEntries.map((e) => [`${e.client_id}::${e.analytical_cycle_code}`, e]),
  );
  return betweenEvents.map((ev) => {
    const curr = byKey.get(`${ev.client_id}::${ev.current_cycle}`);
    const meetingsBetween = countMeetingsStrictlyBetween(
      meetings,
      ev.client_id,
      ev.previous_submitted_at,
      ev.current_submitted_at,
    );
    const mechanismsAdded = countMechanismsStrictlyBetween(
      mechanisms,
      ev.client_id,
      ev.previous_submitted_at,
      ev.current_submitted_at,
    );
    const scoreDelta =
      ev.current_score != null && ev.previous_score != null
        ? ev.current_score - ev.previous_score
        : null;
    return {
      ...ev,
      score_delta: scoreDelta,
      evolution_status: curr?.evolution_status ?? null,
      days_since_last_meeting_current: curr?.days_since_last_meeting ?? null,
      meetings_count_current: curr?.meetings_count_before_response ?? null,
      meetings_last_30d: curr?.meetings_last_30d ?? null,
      meetings_last_90d: curr?.meetings_last_90d ?? null,
      meetings_between: meetingsBetween,
      mechanisms_added_count: mechanismsAdded,
      mechanism_added_between_cycles: mechanismsAdded != null ? mechanismsAdded > 0 : null,
      mechanism_implemented: curr?.has_mechanism_before_response ?? null,
      mechanisms_count_before_response: curr?.mechanisms_count_before_response ?? null,
      churn_requested_before_response: curr?.churn_requested_before_response ?? null,
      meetings_between_quality: meetings?.length ? 'point_in_time' : 'unavailable',
      mechanisms_between_quality: mechanisms?.length ? 'point_in_time' : 'unavailable',
    };
  });
}

export function buildMigrationAnalysisPack(betweenEvents, currentCycle) {
  const paired = betweenEvents.filter((e) => e.current_cycle === currentCycle);
  const comparisons = [
    buildMigrationComparison(paired, 'Promotor → Neutro', 'Promotor → Promotor'),
    buildMigrationComparison(paired, 'Promotor → Detrator', 'Promotor → Promotor'),
  ];

  const pValues = [];
  for (const c of comparisons) {
    for (const m of c.metrics) {
      if (m.p_value != null) pValues.push(m.p_value);
    }
  }
  const adjusted = benjaminiHochberg(pValues.map((p) => ({ p_value: p })));
  let idx = 0;
  for (const c of comparisons) {
    for (const m of c.metrics) {
      if (m.p_value != null) {
        m.p_adjusted = adjusted[idx]?.p_value_adjusted ?? null;
        idx++;
      }
    }
    delete c.cohort_a;
    delete c.cohort_b;
  }

  return {
    current_cycle: currentCycle,
    paired_transitions: paired.length,
    comparisons,
  };
}

export function buildPromoterFallSection(comparison) {
  const a = comparison.migration_a;
  const ep = comparison.metrics.find((m) => m.metric_key === 'ep_changed');
  return {
    title: `Quem caiu: ${a}`,
    compare_with: comparison.migration_b,
    n_total: comparison.n_a,
    small_sample: comparison.small_sample,
    ep_changed: {
      n: Math.round(((ep?.pct_a ?? 0) / 100) * comparison.n_a),
      pct: ep?.pct_a,
      compare_pct: ep?.pct_b,
      p_value: ep?.p_value,
      p_adjusted: ep?.p_adjusted,
    },
    metrics: comparison.metrics,
  };
}

export function buildMilestonesQaDoc({ entries, sources, coverage, rawDir, dataCutoff }) {
  const missing = [];
  for (const f of [
    'client_meetings.json',
    'manual_meetings.json',
    'client_mecanismos.json',
    'cancellations.json',
    'client_engajamento_history.json',
  ]) {
    if (!sources?.[f]) missing.push(f);
  }
  const proxyCounts = { current_proxy: 0, unavailable: 0, point_in_time: 0, partial: 0 };
  for (const e of entries) {
    for (const q of Object.values(e.field_quality ?? {})) {
      if (proxyCounts[q] != null) proxyCounts[q]++;
    }
  }
  return {
    generated_at: dataCutoff ?? new Date().toISOString(),
    raw_snapshot_dir: rawDir,
    entries: entries.length,
    coverage_by_field: coverage,
    sources_loaded: sources ?? {},
    missing_optional_sources: missing,
    temporal_quality_totals: proxyCounts,
    invalid_dates: [],
    notes: [
      'Proxies atuais (jornada, app, congelamento snapshot) não devem ser lidos como histórico exato.',
      'Mecanismos sem implemented_at não entram em has_mechanism_before_response.',
      'Tier/reserva/aporte/debitos reservados para etapa futura.',
    ],
  };
}
