#!/usr/bin/env node
/**
 * Postgres voc_classifications → response_topics.json + topic_summary.json
 * Uso: node scripts/materialize-voc-from-postgres.mjs [--response-ids=id1,id2]
 */
import './load-dotenv.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVocPersistenceStore } from '../lib/persistence/voc-persistence-store.mjs';
import {
  mergePostgresIntoResponseTopics,
  mergeManualReviewsIntoResponseTopics,
  writeMaterializedVocBundle,
  loadJsonFile,
  summarizeClassificationSources,
} from '../lib/analytics/voc-materialize-from-db.mjs';
import { manualReviewToTopicRows } from '../lib/persistence/voc-manual-review.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const idsArg = process.argv.find((a) => a.startsWith('--response-ids='));
  const onlyResponseIds = idsArg
    ? new Set(idsArg.replace('--response-ids=', '').split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  return { onlyResponseIds };
}

async function fetchDbRows(store, onlyResponseIds) {
  if (onlyResponseIds?.size) {
    return store.fetchClassificationsForResponseIds([...onlyResponseIds]);
  }
  return store.fetchCurrentClassifications();
}

async function main() {
  const { onlyResponseIds } = parseArgs();
  const store = await createVocPersistenceStore();
  const responses = loadJsonFile(root, 'data/processed/responses.json');
  const cycles = loadJsonFile(root, 'data/processed/cycles.json');
  const cycleSummary = loadJsonFile(root, 'data/processed/cycle_summary.json');
  const existing = loadJsonFile(root, 'data/processed/response_topics.json');

  const responseById = new Map(responses.map((r) => [r.response_id, r]));
  const dbRows = await fetchDbRows(store, onlyResponseIds);
  const manualReviews = store.fetchActiveManualReviews
    ? await store.fetchActiveManualReviews(onlyResponseIds ? [...onlyResponseIds] : null)
    : [];
  await store.close();

  let merged = mergePostgresIntoResponseTopics(existing, dbRows, responseById, { onlyResponseIds });
  const manualTopicRows = [];
  for (const review of manualReviews) {
    const meta = responseById.get(review.response_id);
    manualTopicRows.push(...manualReviewToTopicRows(review, meta));
  }
  merged = mergeManualReviewsIntoResponseTopics(merged, manualTopicRows, { onlyResponseIds });
  const { sources, voc_all_sources } = writeMaterializedVocBundle(root, {
    responseTopics: merged,
    responses,
    cycles,
    dataCutoff: cycleSummary.data_cutoff ?? new Date().toISOString(),
    onlyResponseIds,
  });

  console.log(
    JSON.stringify(
      {
        db_rows: dbRows.length,
        topic_rows: merged.length,
        sources,
        voc_all_periods_sources: voc_all_sources,
        before: summarizeClassificationSources(existing),
        scope: onlyResponseIds ? [...onlyResponseIds] : 'all_current_view',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
