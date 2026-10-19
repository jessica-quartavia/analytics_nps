import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSafrasFilters,
  applySafrasFilters,
} from '../../dashboard/js/data/safras-cobertura-view.mjs';

const sample = [
  {
    client_id: 'abc-1',
    client_name: 'Maria Silva',
    client_email: 'maria@example.com',
    safra_trimestre: '2026-Q3',
    programa: 'PRO',
    ep: 'EP1',
    cliente_ativo: true,
    ever_answered_nps: true,
    app_match: true,
    has_app_access: true,
    app_match_status: 'matched',
  },
  {
    client_id: 'xyz-9',
    client_name: 'João Santos',
    client_email: 'joao@test.com',
    safra_trimestre: 'Sem data',
    programa: 'BASIC',
    ep: 'EP2',
    cliente_ativo: true,
    ever_answered_nps: false,
    app_match: false,
    app_match_status: 'unmatched',
  },
];

test('applySafrasFilters — busca por nome, e-mail e client_id', () => {
  const f = { ...defaultSafrasFilters(), search: 'maria@' };
  assert.equal(applySafrasFilters(sample, f).length, 1);
  assert.equal(applySafrasFilters(sample, { ...f, search: 'xyz-9' }).length, 1);
  assert.equal(applySafrasFilters(sample, { ...f, search: 'JOÃO' }).length, 1);
});

test('applySafrasFilters — Sem data permanece no universo', () => {
  const f = { ...defaultSafrasFilters(), safra: 'Sem data', carteira: 'all' };
  const rows = applySafrasFilters(sample, f);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client_id, 'xyz-9');
});

test('applySafrasFilters — filtro Com App / Sem App', () => {
  const base = { ...defaultSafrasFilters(), carteira: 'all' };
  assert.equal(applySafrasFilters(sample, { ...base, app: 'yes' }).length, 1);
  assert.equal(applySafrasFilters(sample, { ...base, app: 'no' }).length, 1);
});
