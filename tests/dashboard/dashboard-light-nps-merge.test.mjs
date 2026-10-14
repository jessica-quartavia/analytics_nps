import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLightCurrentNpsPayload } from '../../dashboard/js/data/dashboard-runtime-merge.mjs';

describe('light current NPS merge', () => {
  it('substitui janela T3 e mantém histórico fora da janela', () => {
    const bounds = {
      starts_at: '2026-09-15T03:00:00+00:00',
      ends_at: '2026-10-16T02:59:59.999Z',
    };
    const state = {
      cycles: [{ cycle_code: 'NPS-2026-SET-PHARUS', type: 'source_cycle', sequence: 2, ...bounds }],
      responses: [
        {
          client_id: 'old-window',
          score: 6,
          submitted_at: '2026-10-01T00:00:00Z',
          tipo_de_forms: 'NPS',
        },
        {
          client_id: 'hist',
          score: 10,
          submitted_at: '2026-07-01T00:00:00Z',
          tipo_de_forms: 'NPS',
        },
      ],
      cycleSummaryDoc: {
        cycles: [{ cycle_code: 'NPS-2026-SET-PHARUS', valid_responses: 1, nps: 0 }],
      },
    };
    const light = {
      ok: true,
      window_bounds: bounds,
      refreshed_at: '2026-10-14T18:00:00.000Z',
      fingerprint: '407|299|38|2026-10-14',
      executive_current_kpis: {
        valid_responses: 2,
        promoters: 1,
        neutrals: 1,
        detractors: 0,
        nps: 50,
        average_score: 9,
      },
      datasets: {
        cycle_code: 'NPS-2026-SET-PHARUS',
        window_responses: [
          {
            client_id: 'new-a',
            score: 10,
            submitted_at: '2026-10-14T15:50:00Z',
            tipo_de_forms: 'NPS',
            program: 'PHARUS',
          },
          {
            client_id: 'new-b',
            score: 8,
            submitted_at: '2026-10-14T12:00:00Z',
            tipo_de_forms: 'NPS',
            program: 'PHARUS',
          },
        ],
      },
    };
    const out = applyLightCurrentNpsPayload(state, light);
    assert.equal(out.applied, true);
    assert.equal(state.responses.length, 3);
    assert.ok(state.responses.some((r) => r.client_id === 'hist'));
    assert.ok(state.responses.some((r) => r.client_id === 'new-a'));
    assert.ok(!state.responses.some((r) => r.client_id === 'old-window'));
    const set = state.cycleSummaryDoc.cycles[0];
    assert.equal(set.valid_responses, 2);
    assert.equal(set.nps, 50);
  });
});
