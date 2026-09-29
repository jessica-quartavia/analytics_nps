/**
 * ETAPA 3.8 — calibração da fila + QA metodológico (artefatos em data/quality/).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  buildActionQueueCalibration,
  buildCalibrationRecommendation,
} from '../lib/analytics/action-queue-calibration.mjs';
import { buildCrossPageConsistency } from '../lib/analytics/cross-page-consistency.mjs';
import { buildVocManualSample } from '../lib/analytics/voc-manual-sample.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel, fallback = null) => {
  const p = join(root, rel);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
};

const cycleCode =
  process.env.CURRENT_ACTION_CYCLE ??
  readJson('data/processed/paired_cycles.json')?.current_cycle ??
  'NPS-2026-SET-PHARUS';

const t0 = performance.now();
const actionEnriched = readJson('data/processed/action_queue_enriched.json', { entries: [] });
const calibrationCore = buildActionQueueCalibration({
  actionQueueEnrichedDoc: actionEnriched,
  cycleCode,
});
const recommendation = buildCalibrationRecommendation(calibrationCore);
const action_queue_calibration = {
  ...calibrationCore,
  recommendation,
};

writeFileSync(
  join(root, 'data/quality/action_queue_calibration.json'),
  `${JSON.stringify(action_queue_calibration, null, 2)}\n`,
  'utf8',
);

const cross_page_consistency = buildCrossPageConsistency({
  cycleCode,
  cycleSummaryDoc: readJson('data/processed/cycle_summary.json'),
  pairedCyclesDoc: readJson('data/processed/paired_cycles.json'),
  migrationMatrixDoc: readJson('data/processed/migration_matrix.json'),
  epSummaryDoc: readJson('data/processed/ep_summary.json'),
  topicSummaryDoc: readJson('data/processed/topic_summary.json'),
  actionQueueEnrichedDoc: actionEnriched,
  executiveDiagnosisDoc: readJson('data/processed/executive_diagnosis.json'),
  csatSummaryDoc: readJson('data/processed/csat_summary.json'),
  driversSummaryDoc: readJson('data/processed/drivers_summary.json'),
  responses: readJson('data/processed/responses.json', []),
});

writeFileSync(
  join(root, 'data/quality/cross_page_consistency.json'),
  `${JSON.stringify(cross_page_consistency, null, 2)}\n`,
  'utf8',
);

const voc_manual_sample = buildVocManualSample({
  responses: readJson('data/processed/responses.json', []),
  responseTopics: readJson('data/processed/response_topics.json', []),
  cycleCode,
});

writeFileSync(
  join(root, 'data/quality/voc_manual_sample.json'),
  `${JSON.stringify(voc_manual_sample, null, 2)}\n`,
  'utf8',
);

const csatLegacy = readJson('data/quality/csat_legacy_reconciliation.json', {});
const topicSummary = readJson('data/processed/topic_summary.json', {});
const driversSummary = readJson('data/processed/drivers_summary.json', {});
const epSummary = readJson('data/processed/ep_summary.json', {});
const trackingBefore = readJson('data/operational/action_tracking.json', { entries: [] });

const methodological_qa = {
  generated_at: new Date().toISOString(),
  cycle_code: cycleCode,
  csat: {
    scale: '0-5',
    satisfied_rule: 'score >= 4',
    score_10_discarded: true,
    csat_rule_ambiguous: Boolean(csatLegacy.csat_rule_ambiguous),
    legacy_60_3_not_official: true,
    note: 'Legado 60,3% documentado em csat_legacy_reconciliation — não usar como verdade oficial.',
  },
  voc: {
    pct_coverage: topicSummary.classification?.pct_coverage,
    pct_reviewed: topicSummary.classification?.pct_reviewed,
    confidence_mean: topicSummary.classification?.confidence_mean,
    rules_v1_only: true,
    manual_sample_path: 'data/quality/voc_manual_sample.json',
  },
  drivers: {
    uses_fdr: true,
    significant_field: 'significant_fdr_05',
    effect_size_visible: true,
    n_visible: true,
    feature_quality_visible: true,
    logistic_models: driversSummary.logistic_models ?? [],
    no_causal_language_policy: true,
  },
  ep: {
    min_sample: epSummary.min_ep_sample ?? 5,
    ranking_disabled: true,
    low_confidence_field: 'ep_low_confidence_pct',
  },
  action_tracking: {
    path: 'data/operational/action_tracking.json',
    entries_before_qa: trackingBefore.entries?.length ?? 0,
    must_survive_refresh: true,
  },
  executive_diagnosis: {
    path: 'data/processed/executive_diagnosis.json',
    deterministic: true,
    no_llm: true,
  },
  formatting: cross_page_consistency.formatting_expectations,
  performance_ms: {
    qa_script_total: Math.round(performance.now() - t0),
  },
};

writeFileSync(
  join(root, 'data/quality/methodological_qa.json'),
  `${JSON.stringify(methodological_qa, null, 2)}\n`,
  'utf8',
);

console.log(
  JSON.stringify({
    action_queue_calibration: {
      investigate: action_queue_calibration.summary.investigate_count,
      removed_by_proposal: action_queue_calibration.summary.investigate_removed_by_proposal,
      recommendation: recommendation.recommendation,
    },
    cross_page_consistency: cross_page_consistency.status,
    failures: cross_page_consistency.failures_count,
    voc_manual_sample_total: voc_manual_sample.totals.total,
  }),
);
