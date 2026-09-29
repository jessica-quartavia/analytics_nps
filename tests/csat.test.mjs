import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCsatScore,
  isCsatSatisfied,
  summarizeCsatScores,
  getSatisfiedRuleMeta,
} from '../lib/analytics/csat.mjs';
import { buildClientSatisfactionSummary } from '../lib/analytics/csat-pipeline.mjs';
import { CSAT_SCORE_MIN, CSAT_SCORE_MAX } from '../lib/analytics/csat-config.mjs';

describe('csat analytics', () => {
  it('escala 0–5', () => {
    assert.equal(CSAT_SCORE_MIN, 0);
    assert.equal(CSAT_SCORE_MAX, 5);
    assert.equal(isValidCsatScore(5), true);
    assert.equal(isValidCsatScore(10), false);
  });

  it('satisfied rule gte 4', () => {
    assert.equal(isCsatSatisfied(4), true);
    assert.equal(isCsatSatisfied(3), false);
    assert.equal(getSatisfiedRuleMeta().min_score, 4);
  });

  it('average e median', () => {
    const s = summarizeCsatScores([5, 4, 3]);
    assert.equal(s.valid_responses, 3);
    assert.equal(s.average_score, 4);
    assert.equal(s.median_score, 4);
    assert.equal(s.satisfied_responses, 2);
    assert.ok(Math.abs(s.satisfied_pct - 66.666) < 0.1);
  });

  it('client summary has_csat e latest', () => {
    const csat = [
      {
        client_id: 'c1',
        client_name: 'A',
        score: 5,
        submitted_at: '2026-01-02',
        ep_name: 'EP',
      },
      {
        client_id: 'c1',
        score: 4,
        submitted_at: '2026-01-01',
        ep_name: 'EP',
      },
    ];
    const nps = [
      { client_id: 'c1', score: 9, submitted_at: '2026-02-01', client_name: 'A' },
    ];
    const doc = buildClientSatisfactionSummary(csat, nps);
    const row = doc.entries.find((e) => e.client_id === 'c1');
    assert.equal(row.has_csat, true);
    assert.equal(row.has_nps, true);
    assert.equal(row.latest_csat_score, 5);
    assert.equal(row.csat_responses_count, 2);
    assert.equal(row.latest_nps_score, 9);
  });
});
