import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  epManagementStatus,
  formatEpDeltaBadge,
  EP_STATUS,
} from '../../dashboard/js/data/ep-performance.mjs';

describe('ep-performance helpers', () => {
  it('status quadrantes vs NPS geral', () => {
    const entry = { nps: 70, delta_nps_paired: 2, paired_clients: 10 };
    const s = epManagementStatus(entry, 60);
    assert.equal(s.key, EP_STATUS.STRONG);
  });

  it('sem pareados → sem comparação', () => {
    const s = epManagementStatus({ nps: 50, delta_nps_paired: null, paired_clients: 0 }, 60);
    assert.equal(s.key, EP_STATUS.NO_COMPARE);
  });

  it('delta badge legível', () => {
    assert.match(formatEpDeltaBadge(8.2).text, /↑/);
    assert.match(formatEpDeltaBadge(-12.4).text, /↓/);
  });
});
