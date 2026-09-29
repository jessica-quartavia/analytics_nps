/**
 * Regenera ep_summary.json a partir de processed/ (sem BASE QV).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEpSummaryDocument, validateEpSummaryInvariants } from '../lib/analytics/ep-summary.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (name) => JSON.parse(readFileSync(join(root, 'data/processed', name), 'utf8'));

const responses = data('responses.json');
const eligible = data('eligible_clients.json');
const cycles = data('cycles.json');
const cycleSummary = data('cycle_summary.json');
const dataCutoff = cycleSummary.data_cutoff ?? new Date().toISOString();

const doc = buildEpSummaryDocument(responses, eligible, cycles, dataCutoff);
const errors = validateEpSummaryInvariants(doc);
if (errors.length) {
  console.error('Invariantes ep_summary:', errors);
  process.exit(1);
}

const out = {
  data_cutoff: doc.data_cutoff,
  min_ep_sample: doc.min_ep_sample,
  entries: doc.entries.map(({ _ep_key, ...rest }) => rest),
};

writeFileSync(join(root, 'data/processed/ep_summary.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`ep_summary.json — ${out.entries.length} linhas (cycle+EP)`);
