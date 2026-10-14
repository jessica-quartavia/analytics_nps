#!/usr/bin/env node
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { buildNpsPredictionPanelFromBaseQv } from '../lib/analytics/nps-prediction-panel-baseqv.mjs';

const asOf = process.env.ANALYTICS_AS_OF_DATE ?? new Date().toISOString().slice(0, 10);
const TRAINING_YEAR = String(process.env.NPS_TRAINING_WINDOW ?? '2026');

const responses = await readJson('processed/responses.json', []);
const cycles = await readJson('processed/cycles.json', []);
const eligible = await readJson('processed/eligible_clients.json', []);

const fullPanel = buildNpsPredictionPanelFromBaseQv({
  responses: Array.isArray(responses) ? responses : [],
  cycles: Array.isArray(cycles) ? cycles : [],
  eligibleClients: Array.isArray(eligible) ? eligible : [],
  asOfDate: asOf,
});

const trainingCycles = fullPanel.meta.official_cycles ?? [];
const trainingRows = fullPanel.rows ?? [];

const panel = {
  ...fullPanel,
  rows: trainingRows,
  meta: {
    ...fullPanel.meta,
    training_window: TRAINING_YEAR,
    row_count: trainingRows.length,
  },
};

await writeJson('processed/nps_prediction_training_panel.json', panel);
console.log(
  `Panel BASE_QV (${TRAINING_YEAR}): ${panel.meta.row_count} rows, cycles ${trainingCycles.join(', ')}, ` +
    `target ${panel.meta.target_cycle}, current_nps ${panel.meta.current_nps}, ` +
    `training responses ${panel.meta.training_responses}`,
);
