import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCycleForResponse,
  dedupeResponsesByClientCycle,
  isWithinCycleWindow,
} from '../lib/analytics/cycles.mjs';

const cycles = [
  {
    cycle_id: 'a',
    source_cycle_id: 'src-a',
    cycle_code: 'NPS-2026-T2',
    cycle_name: 'NPS 2026-T2',
    starts_at: '2026-07-02T03:00:00Z',
    ends_at: '2026-08-13T02:59:59Z',
  },
  {
    cycle_id: 'b',
    source_cycle_id: 'src-b',
    cycle_code: 'NPS-2026-T3',
    cycle_name: 'NPS 2026-T3',
    starts_at: '2026-09-15T03:00:00Z',
    ends_at: null,
  },
];

describe('cycle resolution', () => {
  it('prioriza nps_send coerente', () => {
    const r = resolveCycleForResponse({
      clientId: 'c1',
      submittedAt: '2026-07-10T12:00:00Z',
      sendsForClient: [
        { cycle_id: 'src-a', client_id: 'c1', sent_at: '2026-07-05T10:00:00Z' },
      ],
      analyticsCycles: cycles,
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.cycle_id, 'a');
    assert.equal(r.method, 'nps_send');
  });

  it('fallback submitted_at_window', () => {
    const r = resolveCycleForResponse({
      clientId: 'c1',
      submittedAt: '2026-09-20T12:00:00Z',
      sendsForClient: [],
      analyticsCycles: cycles,
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.cycle_id, 'b');
    assert.equal(r.method, 'submitted_at_window');
  });

  it('unresolved quando nenhum ciclo conhecido', () => {
    const r = resolveCycleForResponse({
      clientId: 'c1',
      submittedAt: '2026-01-01T00:00:00Z',
      sendsForClient: [],
      analyticsCycles: cycles,
    });
    assert.equal(r.status, 'unresolved');
    assert.equal(r.cycle_resolution_status, 'unresolved');
    assert.equal(r.cycle_id, null);
  });

  it('isWithinCycleWindow com ends null', () => {
    const ms = new Date('2026-10-01T00:00:00Z').getTime();
    assert.equal(isWithinCycleWindow(ms, cycles[1].starts_at, null), true);
  });
});

describe('dedupeResponsesByClientCycle', () => {
  it('mantém submitted_at mais recente', () => {
    const { kept, discarded } = dedupeResponsesByClientCycle([
      {
        client_id: 'c1',
        cycle_id: 'a',
        submitted_at: '2026-07-01T00:00:00Z',
        source_response_id: 'old',
      },
      {
        client_id: 'c1',
        cycle_id: 'a',
        submitted_at: '2026-07-02T00:00:00Z',
        source_response_id: 'new',
      },
    ]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].source_response_id, 'new');
    assert.equal(discarded.length, 1);
  });
});
