import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClientStatus } from '../../lib/analytics/analytical-active-client.mjs';
import {
  applySafrasFilters,
  defaultSafrasFilters,
  enrichSafrasNormalizedStatus,
} from '../../dashboard/js/data/safras-cobertura-view.mjs';

test('normalizeClientStatus — variantes de Ativo', () => {
  assert.equal(normalizeClientStatus('ativo'), 'Ativo');
  assert.equal(normalizeClientStatus('Ativo'), 'Ativo');
  assert.equal(normalizeClientStatus('active'), 'Ativo');
  assert.equal(normalizeClientStatus(' ACTIVE '), 'Ativo');
});

test('normalizeClientStatus — churn → Cancelado', () => {
  assert.equal(normalizeClientStatus('churn'), 'Cancelado');
});

test('filtro Status = Ativo inclui status bruto ativo/Ativo/active', () => {
  const rows = enrichSafrasNormalizedStatus([
    { client_id: '1', status_cliente: 'ativo', cliente_ativo: true },
    { client_id: '2', status_cliente: 'Ativo', cliente_ativo: true },
    { client_id: '3', status_cliente: 'active', cliente_ativo: true },
    { client_id: '4', status_cliente: 'churn', cliente_ativo: false },
  ]);
  const f = { ...defaultSafrasFilters(), carteira: 'all', status: 'Ativo' };
  const out = applySafrasFilters(rows, f);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((r) => r.client_id).sort(),
    ['1', '2', '3'],
  );
});
