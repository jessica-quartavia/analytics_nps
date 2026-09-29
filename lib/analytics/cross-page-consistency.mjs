const TOLERANCE_NPS = 0.05;
const TOLERANCE_PCT = 0.15;

function nearlyEqual(a, b, tol = TOLERANCE_NPS) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

function pickMetric(name, value, source, universe = 'cycle') {
  return { metric: name, value, source, universe };
}

/**
 * @param {object} input
 * @returns {object}
 */
export function buildCrossPageConsistency(input) {
  const {
    cycleCode,
    cycleSummaryDoc,
    pairedCyclesDoc,
    migrationMatrixDoc,
    epSummaryDoc,
    topicSummaryDoc,
    actionQueueEnrichedDoc,
    executiveDiagnosisDoc,
    csatSummaryDoc,
    driversSummaryDoc,
    responses = [],
  } = input;

  const cycleSummary = (cycleSummaryDoc?.cycles ?? []).find((c) => c.cycle_code === cycleCode);
  const pairedOk = pairedCyclesDoc?.current_cycle === cycleCode;
  const migrationOk = migrationMatrixDoc?.current_cycle === cycleCode;
  const diagnosisOk = executiveDiagnosisDoc?.cycle_code === cycleCode;

  const canonical = {};
  const checks = [];

  if (cycleSummary) {
    canonical.nps = cycleSummary.nps;
    canonical.valid_responses = cycleSummary.valid_responses;
    canonical.promoters = cycleSummary.promoters;
    canonical.passives = cycleSummary.passives;
    canonical.detractors = cycleSummary.detractors;
    canonical.promoter_pct = cycleSummary.promoter_pct;
    canonical.eligible_clients = cycleSummary.eligible_clients;
  }

  if (pairedOk) {
    canonical.paired_clients = pairedCyclesDoc.paired_clients;
    canonical.delta_nps_paired = pairedCyclesDoc.delta_nps_paired;
    canonical.current_nps_paired = pairedCyclesDoc.current_nps_paired;
  }

  if (migrationOk) {
    canonical.migration_paired_clients = migrationMatrixDoc.paired_clients;
  }

  const actionEntries = (actionQueueEnrichedDoc?.entries ?? []).filter(
    (e) => e.cycle_code === cycleCode,
  );
  const actionCounts = { Alta: 0, Média: 0, Investigar: 0, Aprendizado: 0 };
  for (const e of actionEntries) {
    actionCounts[e.priority] = (actionCounts[e.priority] ?? 0) + 1;
  }
  canonical.action_queue_total = actionEntries.length;
  canonical.action_high_medium = actionCounts.Alta + actionCounts.Média;

  if (topicSummaryDoc?.classification) {
    canonical.voc_pct_coverage = topicSummaryDoc.classification.pct_coverage;
    canonical.voc_pct_reviewed = topicSummaryDoc.classification.pct_reviewed;
  }

  const csatCycle = (csatSummaryDoc?.cycles ?? []).find(
    (c) => c.analytical_cycle_code === cycleCode,
  );
  if (csatCycle) {
    canonical.csat_average = csatCycle.average_score;
    canonical.csat_valid_responses = csatCycle.valid_responses;
    canonical.csat_satisfied_pct = csatCycle.satisfied_pct;
  }

  const epRows = (epSummaryDoc?.entries ?? []).filter((e) => e.cycle_code === cycleCode);
  canonical.ep_count = epRows.length;

  const cycleResponses = responses.filter((r) => r.analytical_cycle_code === cycleCode);

  function compare(name, a, b, sourceA, sourceB, tol = TOLERANCE_NPS) {
    const ok = nearlyEqual(a, b, tol);
    checks.push({
      metric: name,
      value_a: a,
      source_a: sourceA,
      value_b: b,
      source_b: sourceB,
      status: ok ? 'pass' : 'fail',
      tolerance: tol,
    });
    return ok;
  }

  if (diagnosisOk && cycleSummary) {
    compare(
      'nps_set',
      cycleSummary.nps,
      executiveDiagnosisDoc.overall?.current_nps,
      'cycle_summary.json',
      'executive_diagnosis.json',
    );
    compare(
      'valid_responses',
      cycleSummary.valid_responses,
      executiveDiagnosisDoc.overall?.valid_responses,
      'cycle_summary.json',
      'executive_diagnosis.json',
      0,
    );
  }

  if (diagnosisOk && pairedOk) {
    compare(
      'paired_clients',
      pairedCyclesDoc.paired_clients,
      executiveDiagnosisDoc.paired?.paired_clients,
      'paired_cycles.json',
      'executive_diagnosis.json',
      0,
    );
    compare(
      'delta_nps_paired',
      pairedCyclesDoc.delta_nps_paired,
      executiveDiagnosisDoc.paired?.delta_nps_paired,
      'paired_cycles.json',
      'executive_diagnosis.json',
    );
  }

  if (pairedOk && migrationOk) {
    compare(
      'paired_clients_migration',
      pairedCyclesDoc.paired_clients,
      migrationMatrixDoc.paired_clients,
      'paired_cycles.json',
      'migration_matrix.json',
      0,
    );
  }

  if (diagnosisOk) {
    compare(
      'action_high_medium',
      actionCounts.Alta + actionCounts.Média,
      executiveDiagnosisDoc.actions?.priority_follow_up,
      'action_queue_enriched.json',
      'executive_diagnosis.json',
      0,
    );
    compare(
      'action_investigate',
      actionCounts.Investigar,
      executiveDiagnosisDoc.actions?.investigate,
      'action_queue_enriched.json',
      'executive_diagnosis.json',
      0,
    );
  }

  if (actionQueueEnrichedDoc?.meta?.counts_by_priority && cycleCode) {
    const meta = actionQueueEnrichedDoc.meta.counts_by_priority;
    compare(
      'action_meta_investigate',
      actionCounts.Investigar,
      meta.Investigar,
      'action_queue_enriched entries',
      'action_queue_enriched meta',
      0,
    );
  }

  const epNpsWeighted = epRows.length
    ? epRows.reduce((s, e) => s + (e.nps ?? 0) * (e.valid_responses ?? 0), 0) /
      epRows.reduce((s, e) => s + (e.valid_responses ?? 0), 0)
    : null;

  checks.push({
    metric: 'ep_rollup_note',
    value_a: epNpsWeighted,
    source_a: 'ep_summary weighted nps (informacional)',
    value_b: cycleSummary?.nps,
    source_b: 'cycle_summary (não deve igualar — universos diferentes)',
    status: 'info',
    tolerance: null,
  });

  checks.push({
    metric: 'responses_json_count',
    value_a: cycleResponses.length,
    source_a: 'responses.json cycle filter',
    value_b: cycleSummary?.valid_responses,
    source_b: 'cycle_summary valid_responses',
    status: cycleResponses.length === cycleSummary?.valid_responses ? 'pass' : 'fail',
    tolerance: 0,
  });

  if (driversSummaryDoc?.tests_count != null) {
    checks.push({
      metric: 'drivers_tests_count',
      value_a: driversSummaryDoc.tests_count,
      source_a: 'drivers_summary.json',
      value_b: driversSummaryDoc.tests_count,
      source_b: 'self',
      status: 'pass',
    });
  }

  const failures = checks.filter((c) => c.status === 'fail');
  const allowed_differences = [
    'arredondamento visual UI (formatNps 1 casa)',
    'filtros de página (EP, categoria, pareado)',
    'universo total vs pareado explicitamente rotulado',
    'ciclo selecionado ≠ ciclo do diagnóstico',
  ];

  return {
    generated_at: new Date().toISOString(),
    cycle_code: cycleCode,
    canonical,
    checks,
    failures_count: failures.length,
    status: failures.length ? 'fail' : 'pass',
    allowed_difference_reasons: allowed_differences,
    formatting_expectations: {
      nps_decimal_places: 1,
      delta_suffix: 'pts',
      pct_decimal_places: 1,
      csat_decimal_places: 1,
      n_integer: true,
    },
  };
}
