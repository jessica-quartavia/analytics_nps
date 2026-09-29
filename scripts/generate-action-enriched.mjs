/**
 * Regenera action_queue (outputs) e action_queue_enriched (processed).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildActionQueueForCurrentCycle,
} from '../lib/pipeline/build-analytics.mjs';
import { buildActionQueueEnriched } from '../lib/analytics/action-queue-enriched.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const responses = readJson('data/processed/responses.json');
const responseTopics = existsSync(join(root, 'data/processed/response_topics.json'))
  ? readJson('data/processed/response_topics.json')
  : [];
const clientSat = existsSync(join(root, 'data/processed/client_satisfaction_summary.json'))
  ? readJson('data/processed/client_satisfaction_summary.json')
  : { entries: [] };
const cycleSummary = readJson('data/processed/cycle_summary.json');
const driversSummary = existsSync(join(root, 'data/processed/drivers_summary.json'))
  ? readJson('data/processed/drivers_summary.json')
  : null;

const dataCutoff = cycleSummary.data_cutoff ?? new Date().toISOString();
const cycleCode =
  process.env.CURRENT_ACTION_CYCLE ??
  cycleSummary.cycles?.slice(-1)?.[0]?.cycle_code ??
  'NPS-2026-SET-PHARUS';

const actionQueue = buildActionQueueForCurrentCycle(responses, cycleCode, {
  responseTopics,
  clientSatisfactionDoc: clientSat,
});

const enriched = buildActionQueueEnriched({
  actionQueue,
  responses,
  responseTopics,
  clientSatisfactionDoc: clientSat,
  driversSummary,
  cycleCode,
  dataCutoff,
});

writeFileSync(
  join(root, 'data/outputs/action_queue.json'),
  `${JSON.stringify(actionQueue, null, 2)}\n`,
  'utf8',
);
writeFileSync(
  join(root, 'data/processed/action_queue_enriched.json'),
  `${JSON.stringify(enriched, null, 2)}\n`,
  'utf8',
);

console.log(
  JSON.stringify({
    cycle_code: cycleCode,
    action_queue: actionQueue.length,
    action_queue_enriched: enriched.entries.length,
    counts: enriched.meta.counts_by_priority,
  }),
);
