import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCrossPageConsistency } from '../lib/analytics/cross-page-consistency.mjs';

describe('cross page consistency', () => {
  it('passa quando diagnóstico alinhado', () => {
    const cycle = 'C2';
    const doc = buildCrossPageConsistency({
      cycleCode: cycle,
      cycleSummaryDoc: {
        cycles: [{ cycle_code: cycle, nps: 56.1, valid_responses: 253, promoters: 1, passives: 1, detractors: 1 }],
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
        overall: { current_nps: 56.1, valid_responses: 253 },
        paired: { paired_clients: 81, delta_nps_paired: -16 },
        actions: { priority_follow_up: 2, investigate: 0 },
      },
      csatSummaryDoc: { cycles: [{ analytical_cycle_code: cycle, average_score: 4.8 }] },
      driversSummaryDoc: { tests_count: 10 },
      responses: Array.from({ length: 253 }, () => ({ analytical_cycle_code: cycle })),
    });
    assert.equal(doc.status, 'pass');
    assert.ok(doc.checks.some((c) => c.metric === 'nps_set' && c.status === 'pass'));
  });
});
