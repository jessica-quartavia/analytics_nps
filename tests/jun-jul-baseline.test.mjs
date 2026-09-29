import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeByClientAndAnalyticalCycle,
} from '../lib/analytics/analytical-cycles.mjs';
import { calculateNpsSummary } from '../lib/analytics/nps.mjs';
import {
  JUN_JUL_2026_BASELINE,
  verifyJunJulBaseline,
  buildScoreDistribution,
} from '../lib/analytics/cycle-summary.mjs';

function buildJunJulFixtureRaw257() {
  const rows = [];
  let i = 0;
  const push = (score, n) => {
    for (let k = 0; k < n; k++) {
      rows.push({
        client_id: `client-${i++}`,
        analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
        submitted_at: `2026-06-${String(17 + (i % 10)).padStart(2, '0')}T12:00:00Z`,
        score,
        id: `r-${i}`,
      });
    }
  };
  push(10, 199);
  push(8, 31);
  push(6, 25);
  rows.push({
    client_id: 'client-0',
    analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
    submitted_at: '2026-06-16T00:00:00Z',
    score: 10,
    id: 'dup-a-old',
  });
  rows.push({
    client_id: 'client-1',
    analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
    submitted_at: '2026-07-01T00:00:00Z',
    score: 10,
    id: 'dup-b-old',
  });
  return rows;
}

describe('Jun–Jul baseline regression (fixture local)', () => {
  it('257 raw → 255 após dedupe com P/N/D e NPS aprovados', () => {
    const raw = buildJunJulFixtureRaw257();
    assert.equal(raw.length, 257);
    const { kept, removed } = dedupeByClientAndAnalyticalCycle(raw);
    assert.equal(kept.length, 255);
    assert.equal(removed.length, 2);
    const summary = calculateNpsSummary(kept.map((r) => ({ score: r.score })));
    assert.equal(summary.promoters, 199);
    assert.equal(summary.passives, 31);
    assert.equal(summary.detractors, 25);
    assert.equal(summary.nps, JUN_JUL_2026_BASELINE.nps);
    const dist = buildScoreDistribution(kept);
    const distSum = Object.values(dist).reduce((a, b) => a + b, 0);
    assert.equal(distSum, 255);
  });

  it('verifyJunJulBaseline detecta divergência', () => {
    const bad = verifyJunJulBaseline({
      valid_responses: 254,
      promoters: 199,
      passives: 31,
      detractors: 24,
      nps: 68.23529411764706,
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.failures.some((f) => f.field === 'valid_responses'));
  });
});
