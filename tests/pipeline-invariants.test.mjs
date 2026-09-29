import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRefreshInvariants, buildScoreDistribution } from '../lib/analytics/cycle-summary.mjs';
import { buildMigrationMatrix } from '../lib/analytics/migration-matrix.mjs';
import { buildPairedCycleMetrics } from '../lib/analytics/paired-cycles.mjs';
import { calculateNpsConfidenceInterval } from '../lib/analytics/nps-confidence.mjs';
import { deriveHistoryOnAnalyticalResponses } from '../lib/pipeline/build-analytics.mjs';

describe('refresh invariants', () => {
  it('score_distribution soma = valid_responses', () => {
    const responses = [{ score: 10 }, { score: 8 }, { score: 6 }];
    const dist = buildScoreDistribution(responses);
    assert.equal(Object.values(dist).reduce((a, b) => a + b, 0), 3);
  });

  it('migration matrix counts = paired_clients', () => {
    const responses = [
      { client_id: 'a', analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS', nps_category: 'Promotor', score: 10 },
      { client_id: 'a', analytical_cycle_code: 'NPS-2026-SET-PHARUS', nps_category: 'Detrator', score: 5 },
      { client_id: 'b', analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS', nps_category: 'Neutro', score: 8 },
    ];
    const matrix = buildMigrationMatrix(
      'NPS-2026-JUN-JUL-PHARUS',
      'NPS-2026-SET-PHARUS',
      responses,
    );
    assert.equal(matrix.paired_clients, 1);
    const sum = matrix.cells.reduce((a, c) => a + c.count, 0);
    assert.equal(sum, 1);
    const paired = buildPairedCycleMetrics(
      'NPS-2026-JUN-JUL-PHARUS',
      'NPS-2026-SET-PHARUS',
      responses,
    );
    assert.equal(paired.paired_clients, 1);
    const errors = validateRefreshInvariants(
      [
        { client_id: 'a', analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS', score: 10, nps_category: 'Promotor', response_id: '1' },
        { client_id: 'a', analytical_cycle_code: 'NPS-2026-SET-PHARUS', score: 5, nps_category: 'Detrator', response_id: '2' },
      ],
      [
        {
          cycle_code: 'x',
          valid_responses: 1,
          promoters: 1,
          passives: 0,
          detractors: 0,
          score_distribution: buildScoreDistribution([{ score: 10 }]),
        },
      ],
      matrix,
      paired,
    );
    assert.equal(errors.length, 0);
  });

  it('histórico usa sequence analítica', () => {
    const seq = new Map([
      ['NPS-2026-JUN-JUL-PHARUS', 1],
      ['NPS-2026-SET-PHARUS', 2],
    ]);
    const out = deriveHistoryOnAnalyticalResponses(
      [
        {
          response_id: '2',
          client_id: 'c1',
          analytical_cycle_code: 'NPS-2026-SET-PHARUS',
          submitted_at: '2026-09-20T00:00:00Z',
          score: 6,
        },
        {
          response_id: '1',
          client_id: 'c1',
          analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
          submitted_at: '2026-07-01T00:00:00Z',
          score: 10,
        },
      ],
      seq,
    );
    const set = out.find((r) => r.analytical_cycle_code === 'NPS-2026-SET-PHARUS');
    assert.equal(set.previous_score, 10);
    assert.equal(set.nps_migration, 'Promotor → Detrator');
  });
});

describe('nps confidence bootstrap', () => {
  it('é reprodutível com seed fixa', () => {
    const scores = Array(100).fill(10);
    const a = calculateNpsConfidenceInterval(scores, { seed: 42, iterations: 500 });
    const b = calculateNpsConfidenceInterval(scores, { seed: 42, iterations: 500 });
    assert.equal(a.nps_ci_low, b.nps_ci_low);
    assert.equal(a.nps_ci_high, b.nps_ci_high);
    assert.equal(a.nps_ci_method, 'bootstrap_percentile_95');
  });
});
