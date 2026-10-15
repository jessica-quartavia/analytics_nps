import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNpsHistoricoMeasurements } from '../../lib/analytics/nps-historico-measurements.mjs';

test('buildNpsHistoricoMeasurements dedupe por client_id dentro da medição', () => {
  const rows = [
    {
      client_id: 'a',
      analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
      score: 9,
      submitted_at: '2026-06-01',
      source: 'BASE_QV',
    },
    {
      client_id: 'a',
      analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
      score: 10,
      submitted_at: '2026-07-01',
      source: 'BASE_QV',
    },
    {
      client_id: 'b',
      analytical_cycle_code: 'NPS-2026-SET-PHARUS',
      score: 8,
      submitted_at: '2026-09-01',
      source: 'BASE_QV',
    },
  ];
  const out = buildNpsHistoricoMeasurements(rows);
  const q2 = out.series.find((s) => s.measurement === '2026-Q2');
  const q3 = out.series.find((s) => s.measurement === '2026-Q3');
  assert.equal(q2?.valid_responses, 1);
  assert.equal(q3?.valid_responses, 1);
  assert.equal(out.response_index.length, 2);
});
