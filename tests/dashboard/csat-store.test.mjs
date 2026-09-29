import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterByHasCsat,
  buildClientSatMap,
  getCsatSummaryForCycle,
} from '../../dashboard/js/data/store-core.mjs';

describe('csat store-core', () => {
  const satDoc = {
    entries: [
      { client_id: 'a', has_csat: true },
      { client_id: 'b', has_csat: false },
    ],
  };
  const map = buildClientSatMap(satDoc);
  const rows = [{ client_id: 'a' }, { client_id: 'b' }, { client_id: 'c' }];

  it('filtro Possui CSAT sim', () => {
    assert.equal(filterByHasCsat(rows, map, 'yes').length, 1);
  });

  it('filtro Possui CSAT não', () => {
    const out = filterByHasCsat(rows, map, 'no');
    assert.equal(out.length, 2);
  });

  it('getCsatSummaryForCycle', () => {
    const doc = {
      cycles: [{ analytical_cycle_code: 'C1', average_score: 4.8, valid_responses: 10 }],
    };
    assert.equal(getCsatSummaryForCycle(doc, 'C1')?.valid_responses, 10);
    assert.equal(getCsatSummaryForCycle(doc, 'X'), null);
  });

  it('ausência de CSAT no mapa', () => {
    assert.equal(filterByHasCsat([{ client_id: 'z' }], map, 'yes').length, 0);
  });
});
