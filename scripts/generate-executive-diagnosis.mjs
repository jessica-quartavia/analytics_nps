/**
 * Regenera executive_diagnosis.json a partir de artefatos processados.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveDiagnosis } from '../lib/analytics/executive-diagnosis.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel, fallback = null) => {
  const p = join(root, rel);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
};

const cycles = readJson('data/processed/cycles.json', []);
const cycleSummary = readJson('data/processed/cycle_summary.json', { cycles: [] });
const paired = readJson('data/processed/paired_cycles.json');
const migration = readJson('data/processed/migration_matrix.json');
const epSummary = readJson('data/processed/ep_summary.json');
const topicSummary = readJson('data/processed/topic_summary.json');
const driversSummary = readJson('data/processed/drivers_summary.json');
const commentDrivers = readJson('data/processed/comment_drivers.json', []);
const csatSummary = readJson('data/processed/csat_summary.json');
const actionEnriched = readJson('data/processed/action_queue_enriched.json', { entries: [] });
const actionTracking = readJson('data/operational/action_tracking.json', { entries: [] });
const csatLegacy = readJson('data/quality/csat_legacy_reconciliation.json', {});
const quality = readJson('data/quality/data_quality.json', { entries: [] });
const responses = readJson('data/processed/responses.json', []);

const cycleCode =
  process.env.CURRENT_ACTION_CYCLE ??
  paired?.current_cycle ??
  cycleSummary.cycles?.slice(-1)?.[0]?.cycle_code ??
  'NPS-2026-SET-PHARUS';

const doc = buildExecutiveDiagnosis({
  cycleCode,
  cycles,
  cycleSummaryDoc: cycleSummary,
  pairedCyclesDoc: paired,
  migrationMatrixDoc: migration,
  epSummaryDoc: epSummary,
  topicSummaryDoc: topicSummary,
  driversSummaryDoc: driversSummary,
  commentDriversDoc: commentDrivers,
  csatSummaryDoc: csatSummary,
  actionQueueEnrichedDoc: actionEnriched,
  actionTrackingDoc: actionTracking,
  csatLegacyReconciliation: csatLegacy,
  qualityDoc: quality,
  responses,
  dataCutoff: cycleSummary.data_cutoff,
});

writeFileSync(
  join(root, 'data/processed/executive_diagnosis.json'),
  `${JSON.stringify(doc, null, 2)}\n`,
  'utf8',
);

console.log(
  JSON.stringify({
    cycle_code: doc.cycle_code,
    headline: doc.headline?.text,
    bullets: doc.executive_summary?.length,
    flags: doc.quality?.flags,
  }),
);
