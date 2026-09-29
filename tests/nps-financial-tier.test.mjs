import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFinancialTier, deriveHasDebts } from '../lib/analytics/financial-tier.mjs';

describe('deriveFinancialTier — regra oficial 4.7', () => {
  it('renda 120k → T1 income', () => {
    const r = deriveFinancialTier({ income: 120_000, contribution: 0, reserve: 0 });
    assert.equal(r.tier, 'T1');
    assert.equal(r.tier_reason, 'income');
  });

  it('renda 15k + reserva 600k → T1 reserve', () => {
    const r = deriveFinancialTier({ income: 15_000, contribution: 0, reserve: 600_000 });
    assert.equal(r.tier, 'T1');
    assert.equal(r.tier_reason, 'reserve');
  });

  it('renda 15k + aporte 35k → T1 contribution', () => {
    const r = deriveFinancialTier({ income: 15_000, contribution: 35_000, reserve: 0 });
    assert.equal(r.tier, 'T1');
    assert.equal(r.tier_reason, 'contribution');
  });

  it('renda 75k → T2', () => {
    const r = deriveFinancialTier({ income: 75_000, contribution: 0, reserve: 0 });
    assert.equal(r.tier, 'T2');
    assert.equal(r.tier_reason, 'income');
  });

  it('renda 30k → T3', () => {
    const r = deriveFinancialTier({ income: 30_000, contribution: 0, reserve: 0 });
    assert.equal(r.tier, 'T3');
  });

  it('renda 10k → T4', () => {
    const r = deriveFinancialTier({ income: 10_000, contribution: 0, reserve: 0 });
    assert.equal(r.tier, 'T4');
  });

  it('renda 75k + reserva 600k → T1 (precedência reserva)', () => {
    const r = deriveFinancialTier({ income: 75_000, contribution: 0, reserve: 600_000 });
    assert.equal(r.tier, 'T1');
    assert.equal(r.tier_reason, 'reserve');
  });

  it('renda NULL + reserva 600k → T1', () => {
    const r = deriveFinancialTier({ income: null, contribution: null, reserve: 600_000 });
    assert.equal(r.tier, 'T1');
  });

  it('renda NULL + reserva 100k + aporte 5k → unavailable', () => {
    const r = deriveFinancialTier({ income: null, contribution: 5_000, reserve: 100_000 });
    assert.equal(r.tier, 'unavailable');
  });

  it('renda negativa não classifica por renda inválida sem T1 alternativo', () => {
    const r = deriveFinancialTier({ income: -1, contribution: null, reserve: 100_000 });
    assert.equal(r.tier, 'unavailable');
  });

  it('debts independentes do Tier', () => {
    const t4 = deriveFinancialTier({ income: 10_000, contribution: 0, reserve: 0 });
    assert.equal(deriveHasDebts({ cheque_especial: true }), true);
    assert.equal(t4.tier, 'T4');
    const t1 = deriveFinancialTier({ income: 120_000, contribution: 0, reserve: 0 });
    assert.equal(t1.tier, 'T1');
    assert.equal(deriveHasDebts({ credito_pessoal: true }), true);
  });
});
