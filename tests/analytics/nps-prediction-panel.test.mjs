import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNpsPredictionPanel } from '../../lib/analytics/nps-prediction-panel.mjs';
import { cellMetric } from '../../dashboard/js/data/safras-cobertura-view.mjs';
import { cycleSortKey } from '../../dashboard/js/utils/cycle-sort.mjs';

describe('nps-prediction-panel', () => {
  it('builds rows for official cycles', () => {
    const panel = buildNpsPredictionPanel({
      enrichedResponses: [
        {
          client_id: 'a',
          nps_cycle: '2025-Q2',
          response_date: '2025-05-01',
          score: 10,
          nps_category: 'Promotor',
          meetings_before_response: 1,
          implemented_mechanisms_before_response: 0,
          programa: 'PHARUS',
          safra_trimestre: '2025-Q1',
          tenure_bucket_at_response: '3–6 meses',
        },
      ],
      cohorts: [
        {
          client_id: 'a',
          payment_entry_date: '2025-01-01',
          cliente_ativo: true,
          programa: 'PHARUS',
          safra_trimestre: '2025-Q1',
        },
      ],
      asOfDate: '2026-10-06',
    });
    assert.ok(panel.meta.row_count >= 6);
    assert.equal(panel.meta.target_cycle, '2026-Q4');
  });
});

describe('safras helpers', () => {
  it('cellMetric and cycleSortKey are defined', () => {
    assert.equal(typeof cellMetric, 'function');
    assert.equal(typeof cycleSortKey, 'function');
    assert.equal(cellMetric([9, 10, 6], 'nps'), 33.3);
    assert.ok(cycleSortKey('2026-Q3') > cycleSortKey('2026-Q2'));
  });
});
