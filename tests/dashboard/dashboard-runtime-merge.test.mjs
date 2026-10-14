import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeRefreshPayload } from '../../dashboard/js/data/dashboard-runtime-merge.mjs';

describe('dashboard runtime merge', () => {
  it('substitui responses e cycle_summary pelo payload runtime', () => {
    const state = {
      cycles: [{ cycle_code: 'NPS-2026-SET-PHARUS', type: 'source_cycle', sequence: 2, starts_at: '2026-09-15T03:00:00+00:00', ends_at: '2026-10-16T02:59:59.999Z' }],
      responses: [{ client_id: 'old', score: 5, submitted_at: '2026-10-01T00:00:00Z', tipo_de_forms: 'NPS' }],
      cycleSummaryDoc: {
        cycles: [
          {
            cycle_code: 'NPS-2026-SET-PHARUS',
            valid_responses: 1,
            nps: 0,
            promoters: 0,
            passives: 0,
            detractors: 1,
          },
        ],
      },
    };
    const runtimeResponses = [
      { client_id: 'a', score: 10, submitted_at: '2026-10-14T15:50:00Z', tipo_de_forms: 'NPS' },
      { client_id: 'b', score: 8, submitted_at: '2026-10-14T12:00:00Z', tipo_de_forms: 'NPS' },
    ];
    const runtime = {
      datasets: {
        responses: runtimeResponses,
        cycle_summary: {
          cycles: [
            {
              cycle_code: 'NPS-2026-SET-PHARUS',
              valid_responses: 999,
              nps: 99,
              promoters: 1,
              passives: 1,
              detractors: 0,
              average_score: 9,
            },
          ],
        },
      },
      latest_nps_response_at: '2026-10-14T15:50:00Z',
    };
    const result = applyRuntimeRefreshPayload(state, runtime, {
      buildClientSatMap: () => new Map(),
    });
    assert.equal(result.applied, true);
    assert.equal(state.responses.length, 2);
    assert.notEqual(state.responses[0].client_id, 'old');
    const set = state.cycleSummaryDoc.cycles.find((c) => c.cycle_code === 'NPS-2026-SET-PHARUS');
    assert.equal(set.valid_responses, 2);
    assert.equal(set.nps, 50);
    assert.equal(set.average_score, 9);
  });
});
