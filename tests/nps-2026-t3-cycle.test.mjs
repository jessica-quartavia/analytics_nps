import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAnalyticalCycleConfig,
  resolveCycleBounds,
  matchesAnalyticalCycle,
  operationalCycleStatus,
  resolveAnalyticalCycleForResponse,
  BRAZIL_END_OF_DAY_UTC,
} from '../lib/analytics/analytical-cycles.mjs';
import { buildAnalyticalCyclesCatalog } from '../lib/pipeline/analytical-response-builder.mjs';

const sourceCycles = [
  {
    id: '7f9f8b42-84ae-4e00-a408-d22bea7c4407',
    name: 'NPS 2026-T3',
    starts_at: '2026-09-15T03:00:00+00:00',
    ends_at: null,
  },
];

const pharus = { programa: 'PHARUS' };

describe('NPS 2026-T3 — janela analítica Set/2026', () => {
  const config = loadAnalyticalCycleConfig();
  const setDef = config.find((c) => c.cycle_code === 'NPS-2026-SET-PHARUS');

  it('config: starts 15/09 e ends fim do dia 15/10 (BR)', () => {
    assert.ok(setDef);
    assert.equal(setDef.starts_at, '2026-09-15T03:00:00+00:00');
    assert.equal(setDef.ends_at, BRAZIL_END_OF_DAY_UTC['2026-10-15']);
    const bounds = resolveCycleBounds(setDef, sourceCycles);
    assert.equal(bounds.ends_at, setDef.ends_at);
  });

  it('resposta em 15/10 entra no ciclo', () => {
    const r = {
      client_id: 'c1',
      score: 10,
      submitted_at: '2026-10-15T20:00:00-03:00',
      tipo_de_forms: 'NPS',
    };
    assert.equal(matchesAnalyticalCycle(r, pharus, setDef, sourceCycles), true);
    const a = resolveAnalyticalCycleForResponse(r, pharus, setDef, sourceCycles);
    assert.equal(a?.analytical_cycle_code, 'NPS-2026-SET-PHARUS');
  });

  it('resposta após fechamento não entra no ciclo', () => {
    const r = {
      client_id: 'c2',
      score: 9,
      submitted_at: '2026-10-16T10:00:00-03:00',
      tipo_de_forms: 'NPS',
    };
    assert.equal(matchesAnalyticalCycle(r, pharus, setDef, sourceCycles), false);
    assert.equal(resolveAnalyticalCycleForResponse(r, pharus, setDef, sourceCycles), null);
  });

  it('ciclo parcial (open) antes do fechamento', () => {
    const bounds = resolveCycleBounds(setDef, sourceCycles);
    const beforeClose = new Date('2026-10-10T15:00:00Z').getTime();
    assert.equal(operationalCycleStatus(setDef, bounds, beforeClose), 'open');
    const catalog = buildAnalyticalCyclesCatalog(sourceCycles, config);
    const setCat = catalog.find((c) => c.cycle_code === 'NPS-2026-SET-PHARUS');
    assert.equal(operationalCycleStatus(setDef, bounds, beforeClose), setCat?.status);
  });

  it('ciclo fechado (closed) após ends_at', () => {
    const bounds = resolveCycleBounds(setDef, sourceCycles);
    const afterClose = new Date('2026-10-16T12:00:00Z').getTime();
    assert.equal(operationalCycleStatus(setDef, bounds, afterClose), 'closed');
  });
});
