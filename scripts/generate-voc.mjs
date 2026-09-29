/**
 * Regenera response_topics.json e topic_summary.json a partir de processed/ (sem BASE QV).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocArtifacts } from '../lib/analytics/voc-pipeline.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (name) => JSON.parse(readFileSync(join(root, 'data/processed', name), 'utf8'));

const responses = data('responses.json');
const cycles = data('cycles.json');
const cycleSummary = data('cycle_summary.json');
const dataCutoff = cycleSummary.data_cutoff ?? new Date().toISOString();

const { responseTopics, topicSummary } = await buildVocArtifacts(responses, cycles, dataCutoff, {
  loadExternalPath: true,
});

writeFileSync(
  join(root, 'data/processed/response_topics.json'),
  JSON.stringify(responseTopics, null, 2) + '\n',
  'utf8',
);
writeFileSync(
  join(root, 'data/processed/topic_summary.json'),
  JSON.stringify(topicSummary, null, 2) + '\n',
  'utf8',
);

console.log(
  `VoC — ${responseTopics.length} linhas topic; cobertura ${topicSummary.classification.pct_coverage.toFixed(1)}% (${topicSummary.classification.comments_with_topic}/${topicSummary.classification.comments_total} comentários)`,
);
