import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  parseEntryDate,
  buildBase0EntryDateIndexes,
  matchBaseQvClientToBase0,
  buildHistorico2Dataset,
} from '../../lib/analytics/historico2-entry-date-match.mjs';

describe('historico2 entry date match', () => {
  it('normalizes cpf and email', () => {
    assert.equal(normalizeCpf('123.456.789-09'), '12345678909');
    assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com');
    assert.equal(normalizePhone('+55 (11) 98765-4321').length >= 10, true);
  });

  it('derives quarter cohort from entry_date', () => {
    const pack = buildHistorico2Dataset({
      baseQvClients: [{ id: 'c1', name: 'Test', programa: 'PHARUS', status: 'ativo' }],
      base0Rows: [
        {
          base_qv_id: 'c1',
          data_entrada: '2026-02-06',
          cpf_norm: '12345678909',
        },
      ],
      npsResponses: [{ client_id: 'c1', score: 10, submitted_at: '2026-09-01' }],
      asOfDate: '2026-10-06',
    });
    const row = pack.clients[0];
    assert.equal(row.entry_cohort, '2026-Q1');
    assert.equal(row.entry_date_match_method, 'base_qv_id');
    assert.equal(row.nps_source, 'base_qv');
  });

  it('prefers base_qv_id over cpf', () => {
    const indexes = buildBase0EntryDateIndexes([
      { base_qv_id: 'id-a', data_entrada: '2024-01-15', cpf_norm: '11111111111' },
      { base_qv_id: 'id-b', data_entrada: '2024-07-11', cpf_norm: '22222222222' },
    ]);
    const m = matchBaseQvClientToBase0(
      { client_id: 'id-a', cpf: '11111111111', email: null, phone: null },
      indexes,
    );
    assert.equal(m.entry_date_match_method, 'base_qv_id');
    assert.equal(m.entry_date, '2024-01-15');
  });

  it('marks ambiguous when identifiers disagree', () => {
    const indexes = buildBase0EntryDateIndexes([
      { base_qv_id: 'id-a', data_entrada: '2024-01-15', cpf_norm: '11111111111' },
      { base_qv_id: 'id-b', data_entrada: '2024-08-01', cpf_norm: '22222222222', email_norm: 'x@test.com' },
    ]);
    const m = matchBaseQvClientToBase0(
      { client_id: 'id-a', cpf: '22222222222', email: 'x@test.com', phone: null },
      indexes,
    );
    assert.equal(m.entry_date_match_method, 'ambiguous');
    assert.equal(m.entry_date, null);
  });

  it('marks conflict when duplicate base_qv_id with different dates', () => {
    const indexes = buildBase0EntryDateIndexes([
      { base_qv_id: 'id-a', data_entrada: '2024-01-15' },
      { base_qv_id: 'id-a', data_entrada: '2024-08-01' },
    ]);
    const m = matchBaseQvClientToBase0({ client_id: 'id-a', cpf: null, email: null, phone: null }, indexes);
    assert.equal(m.entry_date_match_method, 'ambiguous');
    assert.equal(m.entry_date_conflict, true);
  });

  it('null entry_date does not assign cohort', () => {
    const pack = buildHistorico2Dataset({
      baseQvClients: [{ id: 'x', name: 'No match', programa: 'PHARUS' }],
      base0Rows: [],
      npsResponses: [],
      asOfDate: '2026-10-06',
    });
    assert.equal(pack.clients[0].entry_cohort, null);
    assert.equal(pack.clients[0].entry_date_match_method, 'unmatched');
  });

  it('parseEntryDate rejects invalid', () => {
    assert.equal(parseEntryDate('not-a-date'), null);
    assert.equal(parseEntryDate('2024-07-11'), '2024-07-11');
  });
});
