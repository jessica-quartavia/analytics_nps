/**
 * Regenera driver_features, driver_tests, drivers_summary, comment_drivers.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDriversArtifacts } from '../lib/analytics/drivers-pipeline.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readProcessed = (name) =>
  JSON.parse(readFileSync(join(root, 'data/processed', name), 'utf8'));

function latestRawClients() {
  const rawDir = join(root, 'data/raw');
  if (!existsSync(rawDir)) return new Map();
  const dirs = readdirSync(rawDir)
    .filter((d) => existsSync(join(rawDir, d, 'clients.json')))
    .sort()
    .reverse();
  if (!dirs[0]) return new Map();
  const clients = JSON.parse(readFileSync(join(rawDir, dirs[0], 'clients.json'), 'utf8'));
  return new Map(clients.map((c) => [c.id, c]));
}

const responses = readProcessed('responses.json');
const csatResponses = existsSync(join(root, 'data/processed/csat_responses.json'))
  ? readProcessed('csat_responses.json')
  : [];
const responseTopics = existsSync(join(root, 'data/processed/response_topics.json'))
  ? readProcessed('response_topics.json')
  : [];
const cycles = readProcessed('cycles.json');
const cycleSummary = readProcessed('cycle_summary.json');
const pairedDoc = readProcessed('paired_cycles.json');
const dataCutoff = cycleSummary.data_cutoff ?? new Date().toISOString();

const clientsById = latestRawClients();

const artifacts = buildDriversArtifacts({
  responses,
  csatResponses,
  responseTopics,
  clientsById,
  meetings: [],
  mechanisms: [],
  cycles,
  dataCutoff,
  pairedDoc,
});

const write = (rel, data) =>
  writeFileSync(join(root, rel), JSON.stringify(data, null, 2) + '\n', 'utf8');

write('data/processed/driver_features.json', artifacts.driver_features);
write('data/processed/driver_tests.json', artifacts.driver_tests);
write('data/processed/drivers_summary.json', artifacts.drivers_summary);
write('data/processed/comment_drivers.json', artifacts.comment_drivers);

console.log(
  `Drivers — ${artifacts.driver_features.length} features; ${artifacts.driver_tests.length} testes; ${artifacts.drivers_summary.significant_fdr_count} significativos (FDR); ${artifacts.comment_drivers.length} comment drivers`,
);
