import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNpsScore,
  dedupeLatestNpsByClient,
  aggregateNpsFromResponses,
} from '../../lib/analytics/nps.mjs';

describe('nps kernel', () => {
  it('classifica 9/10 promotor, 7/8 neutro, 0-6 detrator', () => {
    assert.equal(classifyNpsScore(10), 'Promotor');
    assert.equal(classifyNpsScore(9), 'Promotor');
    assert.equal(classifyNpsScore(8), 'Neutro');
    assert.equal(classifyNpsScore(7), 'Neutro');
    assert.equal(classifyNpsScore(6), 'Detrator');
    assert.equal(classifyNpsScore(0), 'Detrator');
  });

  it('dedupe mantém última resposta válida por cliente', () => {
    const rows = [
      { client_id: 'a', score: 4, submitted_at: '2026-09-01T10:00:00Z' },
      { client_id: 'a', score: 10, submitted_at: '2026-10-01T10:00:00Z' },
    ];
    const out = dedupeLatestNpsByClient(rows, { requireClientId: true });
    assert.equal(out.length, 1);
    assert.equal(out[0].score, 10);
  });

  it('aggregateNpsFromResponses inclui average_score', () => {
    const rows = [
      { client_id: '1', score: 10 },
      { client_id: '2', score: 8 },
    ];
    const agg = aggregateNpsFromResponses(rows, { dedupe: true });
    assert.equal(agg.average_score, 9);
  });

  it('P+N+D = N e percentuais fecham 100%', () => {
    const rows = [
      { client_id: '1', score: 10 },
      { client_id: '2', score: 8 },
      { client_id: '3', score: 5 },
    ];
    const agg = aggregateNpsFromResponses(rows, { dedupe: true });
    assert.equal(agg.promoters + agg.neutrals + agg.detractors, agg.responses);
    const sum = agg.promoter_pct + agg.neutral_pct + agg.detractor_pct;
    assert.ok(Math.abs(sum - 100) < 0.01);
  });
});
