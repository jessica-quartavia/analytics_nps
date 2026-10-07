import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SAFRAS_NPS_PERIOD_OPTIONS, historyMatchesSafrasNpsPeriod } from '../../dashboard/js/data/safras-nps-period.mjs';
import {
  enrichCustomersForNpsPeriod,
  computeSafrasKpis,
  applySafrasFilters,
  defaultSafrasFilters,
  computeCarteiraAudit,
} from '../../dashboard/js/data/safras-cobertura-view.mjs';

describe('safras nps period', () => {
  it('opções UI simplificadas passado/atual', () => {
    assert.deepEqual(
      SAFRAS_NPS_PERIOD_OPTIONS.map((o) => o.label),
      ['Todos', 'NPS passado', 'NPS atual'],
    );
  });

  it('filtra histórico por source', () => {
    assert.equal(historyMatchesSafrasNpsPeriod({ source: 'historical' }, 'base0'), true);
    assert.equal(historyMatchesSafrasNpsPeriod({ source: 'current' }, 'base0'), false);
  });

  it('recalcula KPIs no período current', () => {
    const customers = [{ client_id: 'a', ever_answered_nps: false, last_nps_score: null }];
    const history = [
      {
        client_id: 'a',
        source: 'current',
        ciclo: 'NPS-2026-JUN-JUL-PHARUS',
        nota_nps: 9,
        categoria: 'Promotor',
      },
    ];
    const enriched = enrichCustomersForNpsPeriod(customers, history, 'current');
    const kpis = computeSafrasKpis(enriched, { npsPeriod: 'current' });
    assert.equal(kpis.answered, 1);
    assert.equal(kpis.nps, 100);
  });

  it('default filtro Carteira = Ativos (cliente_ativo)', () => {
    const defaults = defaultSafrasFilters();
    assert.equal(defaults.carteira, 'active');
    const customers = [
      { client_id: 'a', cliente_ativo: true, ever_answered_nps: true },
      { client_id: 'b', cliente_ativo: false, ever_answered_nps: true },
    ];
    const activeOnly = applySafrasFilters(customers, defaults);
    assert.equal(activeOnly.length, 1);
    assert.equal(activeOnly[0].client_id, 'a');
    const audit = computeCarteiraAudit(customers);
    assert.equal(audit.total_all, 2);
    assert.equal(audit.total_active, 1);
    assert.equal(audit.total_excluded, 1);
  });
});
