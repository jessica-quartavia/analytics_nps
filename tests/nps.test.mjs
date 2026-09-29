import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNpsScore, isValidScore } from '../lib/analytics/nps.mjs';

describe('classifyNpsScore', () => {
  it('classifica Detrator 0–6', () => {
    assert.equal(classifyNpsScore(0), 'Detrator');
    assert.equal(classifyNpsScore(6), 'Detrator');
  });
  it('classifica Neutro 7–8', () => {
    assert.equal(classifyNpsScore(7), 'Neutro');
    assert.equal(classifyNpsScore(8), 'Neutro');
  });
  it('classifica Promotor 9–10', () => {
    assert.equal(classifyNpsScore(9), 'Promotor');
    assert.equal(classifyNpsScore(10), 'Promotor');
  });
  it('rejeita score inválido', () => {
    assert.throws(() => classifyNpsScore(11));
    assert.equal(isValidScore(5), true);
    assert.equal(isValidScore(5.5), false);
  });
});
