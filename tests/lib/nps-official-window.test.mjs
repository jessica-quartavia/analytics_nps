import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNpsFromResponses,
  aggregateNpsForOfficialSourceCycleWindow,
  meanNpsScoreFromRows,
} from '../../lib/analytics/nps.mjs';

const SET_BOUNDS = {
  starts_at: '2026-09-15T03:00:00+00:00',
  ends_at: '2026-10-16T02:59:59.999Z',
};

describe('NPS universo oficial (janela T3)', () => {
  it('referência 301+70+37=408 → NPS 64,705882…', () => {
    const rows = [];
    for (let i = 0; i < 301; i++) rows.push({ client_id: `p${i}`, score: 10, submitted_at: '2026-10-01T12:00:00Z', tipo_de_forms: 'NPS' });
    for (let i = 0; i < 70; i++) rows.push({ client_id: `n${i}`, score: 8, submitted_at: '2026-10-01T12:00:00Z', tipo_de_forms: 'NPS' });
    for (let i = 0; i < 37; i++) rows.push({ client_id: `d${i}`, score: 4, submitted_at: '2026-10-01T12:00:00Z', tipo_de_forms: 'NPS' });
    const agg = aggregateNpsFromResponses(rows, { dedupe: true, requireClientId: true });
    assert.equal(agg.responses, 408);
    assert.equal(agg.promoters, 301);
    assert.equal(agg.neutrals, 70);
    assert.equal(agg.detractors, 37);
    const expected = ((301 - 37) / 408) * 100;
    assert.ok(Math.abs(agg.nps - expected) < 1e-9);
    assert.ok(Math.abs(agg.nps - 64.70588235294118) < 1e-9);
  });

  it('nota média usa o mesmo array deduplicado do NPS', () => {
    const rows = [
      { client_id: 'a', score: 10, submitted_at: '2026-10-02T00:00:00Z', tipo_de_forms: 'NPS' },
      { client_id: 'a', score: 4, submitted_at: '2026-10-01T00:00:00Z', tipo_de_forms: 'NPS' },
      { client_id: 'b', score: 8, submitted_at: '2026-10-01T00:00:00Z', tipo_de_forms: 'NPS' },
    ];
    const agg = aggregateNpsForOfficialSourceCycleWindow(rows, SET_BOUNDS);
    assert.equal(agg.responses, 2);
    assert.equal(agg.promoters, 1);
    assert.equal(agg.neutrals, 1);
    assert.equal(agg.average_score, 9);
    assert.equal(meanNpsScoreFromRows([{ score: 10 }, { score: 8 }]), 9);
  });

  it('exclui respostas fora da janela e sem client_id', () => {
    const rows = [
      { client_id: 'in', score: 9, submitted_at: '2026-10-01T00:00:00Z', tipo_de_forms: 'NPS' },
      { client_id: 'out', score: 9, submitted_at: '2026-08-01T00:00:00Z', tipo_de_forms: 'NPS' },
      { score: 10, submitted_at: '2026-10-01T00:00:00Z', tipo_de_forms: 'NPS' },
    ];
    const agg = aggregateNpsForOfficialSourceCycleWindow(rows, SET_BOUNDS);
    assert.equal(agg.responses, 1);
  });

  it('coerência: P+N+D = respostas; taxa = respostas/envios', () => {
    const valid = 408;
    const sends = 1202;
    const p = 301;
    const n = 70;
    const d = 37;
    assert.equal(p + n + d, valid);
    assert.ok(Math.abs(valid / sends - 408 / 1202) < 1e-9);
    const nps = ((p - d) / valid) * 100;
    assert.ok(Math.abs(nps - 64.70588235294118) < 1e-9);
  });
});
