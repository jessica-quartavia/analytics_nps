import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEpAtDate } from '../lib/analytics/ep-history.mjs';

const epMap = new Map([['tiago junior', 'ep-tiago'], ['pedro goulart', 'ep-pedro']]);

describe('resolveEpAtDate', () => {
  it('retrocede via transfer_log', () => {
    const r = resolveEpAtDate({
      clientId: 'c1',
      responseDate: '2026-09-01T00:00:00Z',
      currentEpName: 'Pedro Goulart',
      transferLogs: [
        {
          engenheiro_anterior: 'Tiago Junior',
          engenheiro_novo: 'Pedro Goulart',
          created_at: '2026-09-22T13:00:00Z',
        },
      ],
      previousFromJson: [],
      epNameToId: epMap,
    });
    assert.equal(r.ep_name, 'Tiago Junior');
    assert.equal(r.ep_id, 'ep-tiago');
    assert.equal(r.resolution_method, 'transfer_log');
    assert.equal(r.confidence, 'high');
  });

  it('current_proxy quando só EP atual', () => {
    const r = resolveEpAtDate({
      clientId: 'c1',
      responseDate: '2026-09-01T00:00:00Z',
      currentEpName: 'Pedro Goulart',
      transferLogs: [],
      previousFromJson: [],
      epNameToId: epMap,
    });
    assert.equal(r.resolution_method, 'current_proxy');
    assert.equal(r.confidence, 'low');
  });

  it('current_proxy low quando sem logs e json', () => {
    const r = resolveEpAtDate({
      clientId: 'c1',
      responseDate: '2020-01-01T00:00:00Z',
      currentEpName: 'Pedro Goulart',
      transferLogs: [
        {
          engenheiro_anterior: 'A',
          engenheiro_novo: 'B',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      previousFromJson: [],
      epNameToId: epMap,
    });
    assert.equal(r.resolution_method, 'transfer_log');
  });
});
