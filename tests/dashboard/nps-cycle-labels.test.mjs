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
      { ciclo: 'NPS-2026-JUN-JUL-PHARUS', respostas: 254, is_official: false },
      { ciclo: '2026-Q2', respostas: 262, nps_oficial: 68.7, is_official: true },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].ciclo, '2026-Q2');
  });
});
