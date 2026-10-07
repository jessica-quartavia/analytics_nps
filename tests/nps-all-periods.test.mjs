import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNpsAllPeriods, filterNpsAllPeriods } from '../lib/analytics/nps-all-periods.mjs';

describe('nps all periods', () => {
  it('dedupe favorece current no match', () => {
    const base0 = [
      {
        base_qv_id: 'c1',
        data_resposta: '2026-06-16',
        nota: 10,
        onda: 'NPS-2026-JUN-JUL-PHARUS',
        dedupe_key: 'b1',
      },
    ];
    const current = [
      {
        response_id: 'r1',
        client_id: 'c1',
        submitted_at: '2026-06-16T13:00:00Z',
        score: 10,
        analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
        nps_category: 'Promotor',
      },
    ];
    const doc = buildNpsAllPeriods({ base0Nps: base0, currentResponses: current });
    assert.equal(doc.audit.matched_both, 1);
    assert.equal(doc.audit.base0_only, 0);
    assert.equal(doc.audit.current_only, 0);
    assert.equal(doc.responses.length, 1);
    assert.equal(doc.responses[0].source, 'current');
  });

  it('filtro base0', () => {
    const rows = [
      { source: 'base0', period: 'Onda 1' },
      { source: 'current', period: 'NPS-2026-JUN-JUL-PHARUS' },
    ];
    assert.equal(filterNpsAllPeriods(rows, 'base0').length, 1);
  });
});
