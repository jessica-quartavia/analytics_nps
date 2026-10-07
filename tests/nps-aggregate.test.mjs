import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNpsFromResponses,
  dedupeLatestNpsByClient,
  calculateNps,
} from '../lib/analytics/nps.mjs';

describe('aggregateNpsFromResponses / dedupe', () => {
  it('caso oficial: 7 P, 1 N, 2 D => 50.0', () => {
    const rows = [
      ...Array(7).fill({ client_id: 'x', score: 10 }),
      { client_id: 'a', score: 8 },
      { client_id: 'b', score: 5 },
      { client_id: 'c', score: 4 },
    ].map((r, i) => ({ ...r, client_id: r.client_id === 'x' ? `p${i}` : r.client_id }));
    const agg = aggregateNpsFromResponses(rows);
    assert.equal(agg.responses, 10);
    assert.equal(agg.promoters, 7);
    assert.equal(agg.neutrals, 1);
    assert.equal(agg.detractors, 2);
    assert.equal(agg.nps, 50);
  });

  it('somente neutros => 0.0', () => {
    assert.equal(
      calculateNps([
        { score: 7 },
        { score: 8 },
      ]),
      0,
    );
  });

  it('todos promotores => 100.0', () => {
    assert.equal(calculateNps([{ score: 9 }, { score: 10 }]), 100);
  });

  it('todos detratores => -100.0', () => {
    assert.equal(calculateNps([{ score: 0 }, { score: 6 }]), -100);
  });

  it('cliente 6 depois 10 no recorte => considera 10', () => {
    const rows = [
      { client_id: 'c1', submitted_at: '2026-09-01T10:00:00Z', score: 6 },
      { client_id: 'c1', submitted_at: '2026-09-02T10:00:00Z', score: 10 },
    ];
    const kept = dedupeLatestNpsByClient(rows);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].score, 10);
    const agg = aggregateNpsFromResponses(rows);
    assert.equal(agg.nps, 100);
    assert.equal(agg.responses, 1);
  });

  it('não usa round(pctP) - round(pctD)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      client_id: `u${i}`,
      score: i < 7 ? 10 : i === 7 ? 8 : 5,
    }));
    const agg = aggregateNpsFromResponses(rows);
    assert.equal(agg.nps, 50);
  });
});
