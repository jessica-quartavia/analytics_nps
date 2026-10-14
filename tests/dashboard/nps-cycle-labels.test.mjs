import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeNpsCycle,
  prepareHistoricoDisplayCycles,
} from '../../dashboard/js/utils/nps-cycle-labels.mjs';

describe('nps cycle labels', () => {
  it('canonicaliza ciclo técnico', () => {
    assert.equal(canonicalizeNpsCycle('NPS-2026-JUN-JUL-PHARUS'), '2026-Q2');
  });

  it('remove duplicata técnica quando trimestre oficial existe', () => {
    const out = prepareHistoricoDisplayCycles([
      {
        ciclo: 'NPS-2026-JUN-JUL-PHARUS',
        respostas: 254,
        respostas_derivadas: 254,
        promotores: 198,
        neutros: 31,
        detratores: 25,
        pct_promotores: 77.9,
        pct_neutros: 12.2,
        pct_detratores: 9.8,
        is_official: false,
      },
      {
        ciclo: '2026-Q2',
        respostas: 262,
        respostas_derivadas: 8,
        promotores: 7,
        neutros: 1,
        detratores: 0,
        pct_promotores: 87.5,
        pct_neutros: 12.5,
        pct_detratores: 0,
        nps_oficial: 68.7,
        is_official: true,
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].ciclo, '2026-Q2');
    assert.equal(out[0].nps_oficial, 68.7);
    assert.equal(out[0].detratores, 25);
    assert.equal(out[0].respostas_derivadas, 254);
  });
});
