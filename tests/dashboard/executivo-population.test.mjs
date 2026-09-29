import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXECUTIVE_KPI_LABELS,
  validatePopulationInvariants,
  dedupeStatsFromAudit,
} from '../../dashboard/js/data/population-transparency.mjs';

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

  it('253 respondentes, client_id únicos, 0 DAVOS', () => {
    const responses = loadJson('data/processed/responses.json');
    const summary = loadJson('data/processed/cycle_summary.json').cycles.find(
      (c) => c.cycle_code === SET,
    );
    const v = validatePopulationInvariants(responses, SET, summary);
    assert.equal(v.count, 253);
    assert.equal(v.distinct_clients, 253);
    assert.equal(v.program.DAVOS, 0);
    assert.equal(v.program.PHARUS, 253);
  });

  it('258 brutas → 5 duplicidades → 253 finais (auditoria)', () => {
    const audit = loadJson('data/quality/nps_population_audit.json');
    const d = dedupeStatsFromAudit(audit);
    assert.equal(d.raw_rows, 258);
    assert.equal(d.duplicates_treated, 5);
    assert.equal(d.final_valid, 253);
  });

  it('P/N/D 174/47/32 e taxa 253/967', () => {
    const responses = loadJson('data/processed/responses.json');
    const summary = loadJson('data/processed/cycle_summary.json').cycles.find(
      (c) => c.cycle_code === SET,
    );
    const v = validatePopulationInvariants(responses, SET, summary);
    assert.equal(v.promoters, 174);
    assert.equal(v.passives, 47);
    assert.equal(v.detractors, 32);
    assert.ok(v.matches_summary);
    assert.equal(summary.eligible_clients, 967);
    assert.ok(Math.abs(v.response_rate - 253 / 967) < 1e-9);
  });
});
