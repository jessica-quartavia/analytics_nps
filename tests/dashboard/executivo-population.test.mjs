import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXECUTIVE_KPI_LABELS,
  validatePopulationInvariants,
} from '../../dashboard/js/data/population-transparency.mjs';
import { aggregateNpsFromResponses } from '../../lib/analytics/nps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SET = 'NPS-2026-SET-PHARUS';

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

describe('executivo — transparência população Set/2026', () => {
  it('label Clientes com envio', () => {
    assert.equal(EXECUTIVE_KPI_LABELS.clientsWithSend, 'Clientes com envio');
    assert.equal(EXECUTIVE_KPI_LABELS.validResponses, 'Respostas válidas');
  });

  it('respondentes alinhados ao cycle_summary, client_id únicos, 0 DAVOS', () => {
    const responses = loadJson('data/processed/responses.json');
    const summary = loadJson('data/processed/cycle_summary.json').cycles.find(
      (c) => c.cycle_code === SET,
    );
    const v = validatePopulationInvariants(responses, SET, summary);
    assert.equal(v.count, summary.valid_responses);
    assert.equal(v.distinct_clients, summary.valid_responses);
    assert.equal(v.program.DAVOS, 0);
    assert.equal(v.program.PHARUS, summary.valid_responses);
    assert.ok(v.matches_summary);
  });

  it('kernel NPS bate cycle_summary no ciclo SET', () => {
    const responses = loadJson('data/processed/responses.json').filter(
      (r) => r.analytical_cycle_code === SET,
    );
    const summary = loadJson('data/processed/cycle_summary.json').cycles.find(
      (c) => c.cycle_code === SET,
    );
    const agg = aggregateNpsFromResponses(responses);
    assert.equal(agg.responses, summary.valid_responses);
    assert.equal(agg.promoters, summary.promoters);
    assert.equal(agg.neutrals, summary.passives);
    assert.equal(agg.detractors, summary.detractors);
    assert.ok(Math.abs(agg.nps - summary.nps) < 1e-9);
  });

  it('P/N/D e taxa coerentes com summary oficial', () => {
    const responses = loadJson('data/processed/responses.json');
    const summary = loadJson('data/processed/cycle_summary.json').cycles.find(
      (c) => c.cycle_code === SET,
    );
    const v = validatePopulationInvariants(responses, SET, summary);
    assert.equal(v.promoters, summary.promoters);
    assert.equal(v.passives, summary.passives);
    assert.equal(v.detractors, summary.detractors);
    assert.ok(v.matches_summary);
    if (summary.eligible_clients) {
      assert.ok(Math.abs(v.response_rate - summary.valid_responses / summary.eligible_clients) < 1e-9);
    }
  });
});
