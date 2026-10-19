import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  matchClientsToApp,
  expandPharusMatchEntry,
  toPublicPharusMatchEntry,
} from '../../lib/analytics/pharus-app-match.mjs';

test('normalizeEmail — trim e lowercase', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
  assert.equal(normalizeEmail('invalid'), '');
});

test('normalizePhone — dígitos e DDI Brasil', () => {
  assert.equal(normalizePhone('(11) 98765-4321'), '11987654321');
  assert.equal(normalizePhone('+55 11 98765-4321'), '11987654321');
});

test('normalizeCpf — rejeita sequência inválida', () => {
  assert.equal(normalizeCpf('111.111.111-11'), '');
});

test('matchClientsToApp — CPF, e-mail, telefone e conflito', () => {
  const appRecords = [
    {
      app_user_id: 'u1',
      cpf: '52998224725',
      email: 'a@test.com',
      phone: '11987654321',
      registered_at: null,
    },
    { app_user_id: 'u2', cpf: '', email: 'b@test.com', phone: '', registered_at: null },
  ];
  const base = [
    { client_id: '1', cpf: '529.982.247-25', email: '', phone: '' },
    { client_id: '2', cpf: '', email: 'B@TEST.COM', phone: '' },
    { client_id: '3', cpf: '', email: '', phone: '+55 11 98765-4321' },
    { client_id: '4', cpf: '52998224725', email: 'b@test.com', phone: '' },
    { client_id: '5', cpf: '', email: '', phone: '' },
  ];
  const { entries } = matchClientsToApp(base, appRecords);
  const byId = Object.fromEntries(entries.map((e) => [e.client_id, e]));
  assert.equal(byId['1'].app_match, true);
  assert.equal(byId['1'].app_match_method, 'cpf');
  assert.equal(byId['2'].app_match_method, 'email');
  assert.equal(byId['3'].app_match_method, 'phone');
  assert.equal(byId['4'].app_match_conflict, true);
  assert.equal(byId['5'].app_match_status, 'insufficient_identifiers');
});

test('artifact público e expand — sem PII', () => {
  const pub = toPublicPharusMatchEntry({
    client_id: 'x',
    has_app: true,
    app_match_method: 'cpf',
  });
  assert.deepEqual(pub, { client_id: 'x', app_match: true, app_match_method: 'cpf' });
  const ex = expandPharusMatchEntry(pub);
  assert.equal(ex.has_app_access, true);
  assert.equal(ex.app_match_status, 'matched');
});

test('Com App + respondeu — filtro lógico', () => {
  const rows = [
    { app_match: true, ever_answered_nps: true },
    { app_match: true, ever_answered_nps: false },
    { app_match_status: 'unmatched', ever_answered_nps: true },
  ];
  const n = rows.filter((c) => c.app_match === true && c.ever_answered_nps).length;
  assert.equal(n, 1);
});
