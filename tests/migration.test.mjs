import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNpsMigration,
  computeScoreDelta,
  computeEvolutionStatus,
} from '../lib/analytics/migration.mjs';

describe('migration & evolution', () => {
  it('computeNpsMigration', () => {
    assert.equal(computeNpsMigration('Promotor', 'Detrator'), 'Promotor → Detrator');
    assert.equal(computeNpsMigration(null, 'Neutro'), null);
  });
  it('computeScoreDelta', () => {
    assert.equal(computeScoreDelta(10, 7), -3);
    assert.equal(computeScoreDelta(null, 7), null);
  });
  it('computeEvolutionStatus', () => {
    assert.equal(computeEvolutionStatus(5, 8), 'Grande melhora');
    assert.equal(computeEvolutionStatus(8, 7), 'Queda');
    assert.equal(computeEvolutionStatus(9, 5), 'Queda severa');
    assert.equal(computeEvolutionStatus(8, 8), 'Estável');
  });
});
