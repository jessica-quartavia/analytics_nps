#!/usr/bin/env node
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { buildNpsPredictionPanel } from '../lib/analytics/nps-prediction-panel.mjs';
import { nextCanonicalCycle } from '../lib/analytics/nps-cycle-canonical.mjs';

const asOf = process.env.ANALYTICS_AS_OF_DATE ?? '2026-10-06';
const TRAINING_YEAR = String(process.env.NPS_TRAINING_WINDOW ?? '2026');

const enriched = await readJson('processed/historical_nps_enriched.json', { responses: [] });
const cohorts = await readJson('processed/customer_nps_cohorts.json', []);

const fullPanel = buildNpsPredictionPanel({
  enrichedResponses: enriched.responses ?? [],
  cohorts,
  asOfDate: asOf,
});

const allCycles = fullPanel.meta.official_cycles ?? [];
const trainingCycles = allCycles.filter((c) => String(c).startsWith(`${TRAINING_YEAR}-`));
const trainingRows = (fullPanel.rows ?? []).filter((r) => trainingCycles.includes(r.cycle));
const lastTrain = trainingCycles[trainingCycles.length - 1] ?? fullPanel.meta.last_official_cycle;

const panel = {
  ...fullPanel,
  rows: trainingRows,
  rows_full_history: fullPanel.rows,
  cycles: (fullPanel.cycles ?? []).filter((c) => trainingCycles.includes(c.ciclo)),
  meta: {
    ...fullPanel.meta,
    training_window: TRAINING_YEAR,
    training_start: trainingCycles[0] ?? null,
    training_end: lastTrain,
    official_cycles_all: allCycles,
    official_cycles: trainingCycles,
    last_official_cycle: lastTrain,
    target_cycle: nextCanonicalCycle(lastTrain) ?? fullPanel.meta.target_cycle,
    row_count: trainingRows.length,
    row_count_full_history: fullPanel.rows?.length ?? 0,
    cycles_full_history: fullPanel.cycles,
    methodology_note:
      'O modelo principal utiliza dados de 2026 para refletir melhor o comportamento recente da carteira e reduzir influência de períodos históricos menos comparáveis.',
    methodology_caveat:
      'Uma janela mais recente aumenta a aderência ao cenário atual, mas reduz a quantidade de histórico disponível.',
  },
};

await writeJson('processed/nps_prediction_training_panel.json', panel);
console.log(
  `Panel (${TRAINING_YEAR}): ${panel.meta.row_count} rows, ${trainingCycles.length} cycles, target ${panel.meta.target_cycle} (full history: ${panel.meta.row_count_full_history} rows)`,
);
