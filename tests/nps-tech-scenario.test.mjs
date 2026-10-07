import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { npsTechnologyScenario, clampNps } from '../lib/analytics/nps-tech-scenario.mjs';

describe('nps technology scenario', () => {
  it('uplift explícito sobre projeção-base', () => {
    assert.equal(npsTechnologyScenario(58.7, 0), 58.7);
    assert.equal(npsTechnologyScenario(58.7, 2), 60.7);
  });

  it('limita [-100, 100]', () => {
    assert.equal(clampNps(150), 100);
    assert.equal(npsTechnologyScenario(95, 10), 100);
  });
});
