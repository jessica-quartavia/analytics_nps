import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveHistoryFields,
  sortClientResponsesChronologically,
} from '../lib/analytics/evolution.mjs';
import { computeCriticalFlag } from '../lib/analytics/critical-flag.mjs';
import { computeActionPriority } from '../lib/analytics/action-priority.mjs';

describe('deriveHistoryFields', () => {
  it('primeira resposta sem histórico', () => {
    const [r] = deriveHistoryFields([{ id: '1', score: 10 }]);
    assert.equal(r.previous_score, null);
    assert.equal(r.recurring_respondent, false);
    assert.equal(r.nps_migration, null);
  });

  it('segunda resposta com delta e migration', () => {
    const out = deriveHistoryFields([
      { id: '1', score: 10 },
      { id: '2', score: 6 },
    ]);
    assert.equal(out[1].previous_score, 10);
    assert.equal(out[1].score_delta, -4);
    assert.equal(out[1].nps_migration, 'Promotor → Detrator');
    assert.equal(out[1].evolution_status, 'Queda severa');
    assert.equal(out[1].recurring_respondent, true);
  });

  it('ordena por cycle_starts_at', () => {
    const sorted = sortClientResponsesChronologically([
      { id: '2', submitted_at: '2026-10-01', cycle_starts_at: '2026-09-15' },
      { id: '1', submitted_at: '2026-08-01', cycle_starts_at: '2026-07-02' },
    ]);
    assert.equal(sorted[0].id, '1');
  });
});

describe('critical flag', () => {
  it('Promotor → Detrator', () => {
    const rows = [
      { nps_category: 'Promotor' },
      { nps_category: 'Detrator', nps_migration: 'Promotor → Detrator', evolution_status: 'Queda severa' },
    ];
    assert.equal(computeCriticalFlag(rows[1], rows, 1), true);
  });

  it('detrator consecutivo', () => {
    const rows = [
      { nps_category: 'Detrator' },
      { nps_category: 'Detrator', nps_migration: 'Detrator → Detrator', evolution_status: 'Estável' },
    ];
    assert.equal(computeCriticalFlag(rows[1], rows, 1), true);
  });
});

describe('action priority', () => {
  it('Alta para Promotor → Detrator', () => {
    const { priority, reasons } = computeActionPriority({
      nps_migration: 'Promotor → Detrator',
      evolution_status: null,
      nps_category: 'Detrator',
      previous_category: 'Promotor',
    });
    assert.equal(priority, 'Alta');
    assert.ok(reasons.some((x) => x.includes('Promotor')));
  });

  it('Aprendizado para Grande melhora', () => {
    const { priority } = computeActionPriority({
      nps_migration: 'Detrator → Neutro',
      evolution_status: 'Grande melhora',
      nps_category: 'Neutro',
      previous_category: 'Detrator',
    });
    assert.equal(priority, 'Aprendizado');
  });
});
