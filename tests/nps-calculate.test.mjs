import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNps, calculateNpsSummary } from '../lib/analytics/nps.mjs';

function mockResponses(counts) {
  const rows = [];
  for (let i = 0; i < counts.promoters; i++) rows.push({ score: 10 });
  for (let i = 0; i < counts.passives; i++) rows.push({ score: 8 });
  for (let i = 0; i < counts.detractors; i++) rows.push({ score: 5 });
  return rows;
}

describe('calculateNps', () => {
  it('70 promotores, 20 neutros, 10 detratores => NPS 60', () => {
    const rows = mockResponses({ promoters: 70, passives: 20, detractors: 10 });
    assert.equal(calculateNps(rows), 60);
    const summary = calculateNpsSummary(rows);
    assert.equal(summary.nps, 60);
    assert.equal(summary.total, 100);
    assert.equal(summary.promoters, 70);
    assert.equal(summary.passives, 20);
    assert.equal(summary.detractors, 10);
  });

  it('100 promotores => 100', () => {
    assert.equal(calculateNps(mockResponses({ promoters: 100, passives: 0, detractors: 0 })), 100);
  });

  it('100 detratores => -100', () => {
    assert.equal(calculateNps(mockResponses({ promoters: 0, passives: 0, detractors: 100 })), -100);
  });

  it('100 neutros => 0', () => {
    assert.equal(calculateNps(mockResponses({ promoters: 0, passives: 100, detractors: 0 })), 0);
  });

  it('sem respostas válidas => null', () => {
    assert.equal(calculateNps([]), null);
    assert.equal(calculateNpsSummary([]).nps, null);
  });

  it('ignora scores inválidos no cálculo', () => {
    const rows = [{ score: 10 }, { score: 11 }, { score: 9 }];
    assert.equal(calculateNps(rows), 100);
  });
});
