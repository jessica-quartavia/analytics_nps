import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNpsPredictionPanelFromBaseQv } from '../../lib/analytics/nps-prediction-panel-baseqv.mjs';
import { buildExecutiveCurrentNpsSummary } from '../../dashboard/js/data/executive-official-nps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, 'data/processed', rel), 'utf8'));
}

describe('nps-prediction BASE_QV panel', () => {
  it('uses only BASE QV responses and 2026 cycles', () => {
    const responses = readJson('responses.json');
    const cycles = readJson('cycles.json');
    const eligible = readJson('eligible_clients.json');
    const panel = buildNpsPredictionPanelFromBaseQv({ responses, cycles, eligibleClients: eligible });
    assert.equal(panel.meta.source, 'BASE_QV');
    assert.equal(panel.meta.training_window, '2026');
    assert.ok(panel.meta.official_cycles.every((c) => String(c).startsWith('2026-')));
    assert.ok(panel.meta.official_cycles.length >= 1);
    assert.ok(panel.rows.length > 0);
  });

  it('current_nps matches executive official kernel for latest cycle', () => {
    const responses = readJson('responses.json');
    const cycles = readJson('cycles.json');
    const eligible = readJson('eligible_clients.json');
    const cycleSummary = readJson('cycle_summary.json');
    const panel = buildNpsPredictionPanelFromBaseQv({ responses, cycles, eligibleClients: eligible });
    const latest = [...cycles].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))[0];
    const template =
      cycleSummary.cycles?.find((c) => c.cycle_code === latest.cycle_code) ?? {};
    const exec = buildExecutiveCurrentNpsSummary(responses, template, latest);
    assert.equal(panel.meta.current_nps, exec.nps);
    assert.equal(panel.meta.current_nps_source, 'source_window_geral_dedupe_latest_per_client');
  });
});

describe('nps_prediction_next_cycle artifact', () => {
  it('declares BASE_QV source and 2026 training window', () => {
    const doc = readJson('nps_prediction_next_cycle.json');
    assert.equal(doc.source, 'BASE_QV');
    assert.equal(doc.training_window, '2026');
    assert.ok(Array.isArray(doc.training_cycles));
  });
});
