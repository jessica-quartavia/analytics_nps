import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOnOrBefore, isStrictlyBetween } from '../lib/analytics/milestone-temporal.mjs';
import {
  buildNpsClientMilestones,
  prepareSourceBundle,
} from '../lib/analytics/nps-milestones.mjs';
import { proportionTest, fisherExact2x2 } from '../lib/analytics/nps-milestones-stats.mjs';

describe('nps milestones temporal', () => {
  it('evento antes da resposta entra', () => {
    assert.equal(isOnOrBefore('2026-09-01', '2026-09-20'), true);
  });

  it('evento depois não entra', () => {
    assert.equal(isOnOrBefore('2026-09-25', '2026-09-20'), false);
  });

  it('troca EP entre respostas na janela', () => {
    assert.equal(isStrictlyBetween('2026-08-15', '2026-07-01', '2026-09-01'), true);
    assert.equal(isStrictlyBetween('2026-06-15', '2026-07-01', '2026-09-01'), false);
  });
});

describe('nps milestones builder', () => {
  const responses = [
    {
      response_id: 'a',
      client_id: 'c1',
      analytical_cycle_code: 'CY1',
      submitted_at: '2026-09-20T12:00:00Z',
      score: 9,
      nps_category: 'Promotor',
      program: 'PHARUS',
      ep_name: 'EP B',
      previous_response_id: 'b',
      previous_score: 10,
    },
    {
      response_id: 'b',
      client_id: 'c1',
      analytical_cycle_code: 'CY0',
      submitted_at: '2026-07-01T12:00:00Z',
      score: 10,
      nps_category: 'Promotor',
      program: 'PHARUS',
      ep_name: 'EP A',
    },
  ];

  const loaded = {
    'engenheiro_transfer_logs.json': [
      {
        client_id: 'c1',
        engenheiro_anterior: 'EP A',
        engenheiro_novo: 'EP B',
        created_at: '2026-08-15T10:00:00Z',
      },
      {
        client_id: 'c1',
        engenheiro_anterior: 'EP X',
        engenheiro_novo: 'EP A',
        created_at: '2026-09-25T10:00:00Z',
      },
    ],
    'client_meetings.json': [
      { client_id: 'c1', start_time: '2026-09-10T10:00:00Z' },
      { client_id: 'c1', start_time: '2026-09-25T10:00:00Z' },
    ],
    'client_mecanismos.json': [
      { client_id: 'c1', implemented_at: '2026-09-18T10:00:00Z' },
      { client_id: 'c1', implemented_at: '2026-09-22T10:00:00Z' },
    ],
    'clients.json': [{ id: 'c1', status: 'ativo', data_inicio_ciclo: '2024-01-01' }],
  };

  it('mecanismo antes/depois', () => {
    const bundle = prepareSourceBundle(loaded);
    const { entries } = buildNpsClientMilestones(responses, bundle);
    const row = entries.find((e) => e.analytical_cycle_code === 'CY1');
    assert.equal(row.mechanisms_count_before_response, 1);
    assert.equal(row.has_mechanism_before_response, true);
  });

  it('reuniões 30d/90d e exclusão futura', () => {
    const bundle = prepareSourceBundle(loaded);
    const { entries } = buildNpsClientMilestones(responses, bundle);
    const row = entries.find((e) => e.analytical_cycle_code === 'CY1');
    assert.equal(row.meetings_count_before_response, 1);
    assert.equal(row.meetings_last_30d, 1);
  });

  it('troca EP entre respostas vs fora da janela', () => {
    const bundle = prepareSourceBundle(loaded);
    const { entries } = buildNpsClientMilestones(responses, bundle);
    const row = entries.find((e) => e.analytical_cycle_code === 'CY1');
    assert.equal(row.changed_ep_since_previous_response, true);
    assert.equal(row.ep_changes_since_previous_response, 1);
    assert.equal(row.ever_changed_ep_before_response, true);
    assert.equal(row.ep_changes_before_response, 1);
  });

  it('Promotor→Neutro vs Promotor→Promotor — proporções', () => {
    const a = [{ ep_changed: true }, { ep_changed: false }];
    const b = [{ ep_changed: false }, { ep_changed: false }, { ep_changed: false }];
    const t = proportionTest(a, b, (r) => r.ep_changed);
    assert.ok(t.pct_a > t.pct_b);
    assert.ok(fisherExact2x2(1, 1, 0, 3).p_value != null);
  });
});
