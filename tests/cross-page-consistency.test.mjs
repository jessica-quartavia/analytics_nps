import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCrossPageConsistency } from '../lib/analytics/cross-page-consistency.mjs';

describe('cross page consistency', () => {
  it('passa quando diagnóstico alinhado', () => {
    const cycle = 'C2';
    const responses = [
      { analytical_cycle_code: cycle, client_id: 'a', score: 10 },
      { analytical_cycle_code: cycle, client_id: 'b', score: 10 },
      { analytical_cycle_code: cycle, client_id: 'c', score: 5 },
    ];
    const doc = buildCrossPageConsistency({
      cycleCode: cycle,
      cycleSummaryDoc: {
        cycles: [
          {
            cycle_code: cycle,
            nps: (100 * (2 - 1)) / 3,
            valid_responses: 3,
            promoters: 2,
            passives: 0,
            detractors: 1,
          },
        ],
      },
      pairedCyclesDoc: { current_cycle: cycle, paired_clients: 81, delta_nps_paired: -16 },
      migrationMatrixDoc: { current_cycle: cycle, paired_clients: 81, cells: [] },
      epSummaryDoc: { entries: [{ cycle_code: cycle, valid_responses: 5, nps: 50 }] },
      topicSummaryDoc: { classification: { pct_coverage: 96 } },
      actionQueueEnrichedDoc: {
        entries: [
          { cycle_code: cycle, priority: 'Alta' },
          { cycle_code: cycle, priority: 'Média' },
        ],
        meta: { counts_by_priority: { Investigar: 0 } },
      },
      executiveDiagnosisDoc: {
        cycle_code: cycle,
        overall: { current_nps: (100 * (2 - 1)) / 3, valid_responses: 3 },
        paired: { paired_clients: 81, delta_nps_paired: -16 },
        actions: { priority_follow_up: 2, investigate: 0 },
      },
      csatSummaryDoc: { cycles: [{ analytical_cycle_code: cycle, average_score: 4.8 }] },
      driversSummaryDoc: { tests_count: 10 },
      responses,
    });
    assert.equal(doc.status, 'pass');
    assert.ok(doc.checks.some((c) => c.metric === 'nps_set' && c.status === 'pass'));
  });
});
