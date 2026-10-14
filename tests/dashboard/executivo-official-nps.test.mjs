import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveCurrentNpsSummary } from '../../dashboard/js/data/executive-official-nps.mjs';
import { aggregateNpsForOfficialSourceCycleWindow } from '../../lib/analytics/nps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SET = 'NPS-2026-SET-PHARUS';

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

describe('executivo official NPS kernel', () => {
  const responses = loadJson('data/processed/responses.json');
  const cycles = loadJson('data/processed/cycles.json');
  const summary = loadJson('data/processed/cycle_summary.json').cycles.find(
    (c) => c.cycle_code === SET,
  );
  const cycleDef = cycles.find((c) => c.cycle_code === SET);

  it('NPS do Executivo usa janela oficial T3 (source_cycle)', () => {
    const bounds = { starts_at: cycleDef.starts_at, ends_at: cycleDef.ends_at };
    const expected = aggregateNpsForOfficialSourceCycleWindow(responses, bounds);
    const live = buildExecutiveCurrentNpsSummary(responses, summary, cycleDef);
    assert.equal(live.valid_responses, expected.responses);
    assert.ok(Math.abs(live.nps - expected.nps) < 1e-9);
    assert.equal(live.promoters, expected.promoters);
    assert.equal(live.passives, expected.neutrals);
    assert.equal(live.detractors, expected.detractors);
    assert.equal(live._nps_universe, 'source_window_geral_dedupe_latest_per_client');
  });

  it('P + N + D = válidas', () => {
    const bounds = { starts_at: cycleDef.starts_at, ends_at: cycleDef.ends_at };
    const agg = aggregateNpsForOfficialSourceCycleWindow(responses, bounds);
    assert.equal(agg.promoters + agg.neutrals + agg.detractors, agg.responses);
  });

  it('latest_nps_response_at preenchido no recorte oficial', () => {
    const bounds = { starts_at: cycleDef.starts_at, ends_at: cycleDef.ends_at };
    const agg = aggregateNpsForOfficialSourceCycleWindow(responses, bounds);
    assert.ok(agg.latest_nps_response_at);
  });

  it('nota média presente no summary executivo', () => {
    const live = buildExecutiveCurrentNpsSummary(responses, summary, cycleDef);
    assert.ok(live.average_score != null);
    assert.ok(live.average_score >= 0 && live.average_score <= 10);
  });
});
