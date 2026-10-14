import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLightCurrentNpsPayload } from '../../dashboard/js/data/dashboard-runtime-merge.mjs';
import { movementKpis } from '../../dashboard/js/data/store-core.mjs';

describe('runtime light merge preserves movement fields', () => {
  it('keeps previous_score after window refresh rows', () => {
    const state = {
      cycles: [{ cycle_code: 'NPS-2026-SET-PHARUS', type: 'source_cycle', sequence: 2 }],
      cycleSummaryDoc: { cycles: [{ cycle_code: 'NPS-2026-SET-PHARUS', nps: 60 }] },
      responses: [
        {
          client_id: 'c1',
          analytical_cycle_code: 'NPS-2026-SET-PHARUS',
          score: 9,
          previous_score: 7,
          evolution_status: 'Melhora',
          submitted_at: '2026-10-01T12:00:00Z',
          program: 'PHARUS',
          source: 'BASE_QV',
        },
      ],
    };
    const light = {
      ok: true,
      window_bounds: { starts_at: '2026-09-15', ends_at: '2026-10-16' },
      datasets: {
        window_responses: [
          {
            client_id: 'c1',
            analytical_cycle_code: 'NPS-2026-SET-PHARUS',
            score: 10,
            submitted_at: '2026-10-14T12:00:00Z',
            program: 'PHARUS',
            source: 'BASE_QV',
          },
        ],
      },
      executive_current_kpis: { valid_responses: 1, nps: 100, promoters: 1, neutrals: 0, detractors: 0 },
    };
    applyLightCurrentNpsPayload(state, light);
    const row = state.responses.find((r) => r.client_id === 'c1');
    assert.equal(row.previous_score, 7);
    assert.equal(row.score, 10);
    assert.equal(row.score_delta, 3);
    const kpis = movementKpis([row]);
    assert.equal(kpis.paired, 1);
  });
});
