import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  spearmanRho,
  chiSquareWithCramersV,
  mannWhitneyU,
  benjaminiHochberg,
  effectLabel,
} from '../lib/analytics/driver-stats.mjs';
import { buildDriverFeatures } from '../lib/analytics/driver-features.mjs';
import { isDeteriorated } from '../lib/analytics/driver-config.mjs';

describe('driver-stats', () => {
  it('Spearman rho=1 perfeito', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = spearmanRho(x, x);
    assert.ok(r.rho > 0.99);
    assert.ok(r.p_value < 0.05);
  });

  it('Cramér V chi-quadrado', () => {
    const table = [
      [10, 5, 2],
      [3, 8, 9],
    ];
    const res = chiSquareWithCramersV(2, 3, table);
    assert.ok(res.effect_size != null);
    assert.ok(res.n === 37);
  });

  it('Mann-Whitney grupos separados', () => {
    const mw = mannWhitneyU([1, 2, 3, 4, 5, 6, 7, 8], [9, 9, 10, 10, 10, 10, 10, 10]);
    assert.ok(mw.p_value < 0.05);
    assert.ok(Math.abs(mw.effect_size) > 0.3);
  });

  it('BH FDR', () => {
    const adj = benjaminiHochberg([{ p_value_raw: 0.01 }, { p_value_raw: 0.04 }, { p_value_raw: 0.2 }]);
    assert.equal(adj[0].significant_fdr_05, true);
    assert.equal(adj[2].significant_fdr_05, false);
  });

  it('effect labels', () => {
    assert.equal(effectLabel(0.05, 'spearman'), 'muito pequeno');
    assert.equal(effectLabel(0.4, 'spearman'), 'moderado');
  });
});

describe('driver-features', () => {
  it('temporal cutoff csat', () => {
    const features = buildDriverFeatures(
      [
        {
          client_id: 'c1',
          response_id: 'r1',
          analytical_cycle_code: 'C1',
          score: 9,
          submitted_at: '2026-09-20T00:00:00Z',
          nps_category: 'Promotor',
        },
      ],
      {
        csatResponses: [
          { client_id: 'c1', score: 5, submitted_at: '2026-09-01T00:00:00Z' },
          { client_id: 'c1', score: 3, submitted_at: '2026-10-01T00:00:00Z' },
        ],
      },
    );
    assert.equal(features.length, 1);
    assert.equal(features[0].csat_average, 5);
    assert.equal(features[0].has_csat, true);
  });

  it('deteriorated migration', () => {
    assert.equal(isDeteriorated({ score_delta: -1 }), true);
    assert.equal(isDeteriorated({ nps_migration: 'Promotor → Detrator' }), true);
    assert.equal(isDeteriorated({ score_delta: 2 }), false);
  });
});
