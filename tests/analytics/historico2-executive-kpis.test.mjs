import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichedRowsForHistorico2Clients,
  buildHistorico2ExecutiveKpis,
} from '../../dashboard/js/data/historico2-executive-kpis.mjs';

test('enrichedRowsForHistorico2Clients respeita recorte de clientes', () => {
  const doc = {
    responses: [
      { client_id: '1', nps_cycle: 'NPS-2026-SET-PHARUS' },
      { client_id: '2', nps_cycle: 'NPS-2026-SET-PHARUS' },
    ],
  };
  const out = enrichedRowsForHistorico2Clients(doc, [{ client_id: '1' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].client_id, '1');
});

test('buildHistorico2ExecutiveKpis calcula recorrentes no recorte', () => {
  const enrichedDoc = {
    responses: [
      { client_id: '1', nps_cycle: 'NPS-2026-JUN-JUL-PHARUS', months_since_entry: 6, meetings_before_response: 4, mechanism_temporal_status: 'point_in_time', has_implemented_mechanism_at_response: true },
      { client_id: '1', nps_cycle: 'NPS-2026-SET-PHARUS', months_since_entry: 8, meetings_before_response: 2, mechanism_temporal_status: 'point_in_time', has_implemented_mechanism_at_response: false },
      { client_id: '2', nps_cycle: 'NPS-2026-SET-PHARUS', months_since_entry: 3, meetings_before_response: 1, mechanism_temporal_status: 'date_unavailable' },
    ],
  };
  const kpis = buildHistorico2ExecutiveKpis({
    filteredClients: [{ client_id: '1' }, { client_id: '2' }],
    clientFilters: { cohort: '2026-Q1' },
    enrichedDoc,
    responses: [],
    cycleDef: null,
    cycleSummaryTemplate: null,
    historicalSummaryDoc: {
      summary: {
        cycles: [
          { ciclo: '2026-Q2', is_official: true, nps_oficial: 50 },
          { ciclo: '2026-Q3', is_official: true, nps_oficial: 59.6, variacao_vs_anterior: -9.1 },
        ],
      },
    },
    liveOfficialSummary: null,
    livePreviousOfficialSummary: null,
    currentCycleCode: 'NPS-2026-SET-PHARUS',
  });
  assert.equal(kpis.uniqueHistoricalClients, 2);
  assert.equal(kpis.recurringClients, 1);
  assert.equal(kpis.cycleResponses, 0);
  assert.equal(kpis.mechanismPct, 50);
});
