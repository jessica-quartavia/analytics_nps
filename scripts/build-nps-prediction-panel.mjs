#!/usr/bin/env node
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { buildNpsPredictionPanel } from '../lib/analytics/nps-prediction-panel.mjs';

const asOf = process.env.ANALYTICS_AS_OF_DATE ?? '2026-10-06';

const enriched = await readJson('processed/historical_nps_enriched.json', { responses: [] });
const cohorts = await readJson('processed/customer_nps_cohorts.json', []);

const panel = buildNpsPredictionPanel({
  enrichedResponses: enriched.responses ?? [],
  cohorts,
  asOfDate: asOf,
});

await writeJson('processed/nps_prediction_training_panel.json', panel);
console.log(
  `Panel: ${panel.meta.row_count} rows, ${panel.meta.official_cycles.length} cycles, target ${panel.meta.target_cycle}`,
);
