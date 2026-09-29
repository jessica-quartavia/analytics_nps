import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAnalyticalCycleForResponse,
  dedupeByClientAndAnalyticalCycle,
  buildJunJulPharusDataset,
  getIndependentPharusSourceCycles,
  resolveCycleBounds,
  loadAnalyticalCycleConfig,
} from '../lib/analytics/analytical-cycles.mjs';
import { calculateNpsSummary } from '../lib/analytics/nps.mjs';

const sourceCycles = [
  {
    id: '5d1bb5b4-43b2-4ad0-ba75-3430d21dfa6a',
    name: 'NPS 2026-T2',
    starts_at: '2026-07-02T03:00:00+00:00',
    ends_at: '2026-08-13T02:59:59+00:00',
  },
  {
    id: '7f9f8b42-84ae-4e00-a408-d22bea7c4407',
    name: 'NPS 2026-T3',
    starts_at: '2026-09-15T03:00:00+00:00',
    ends_at: null,
  },
];

const config = loadAnalyticalCycleConfig();

const pharus = { programa: 'PHARUS' };
const davos = { programa: 'DAVOS' };

describe('Jun–Jul analytical cycle', () => {
  it('A — T2 PHARUS absorvido pelo ciclo Jun–Jul (não ciclo T2 separado)', () => {
    const r = {
      id: 't2-resp',
      client_id: 'c1',
      score: 10,
      submitted_at: '2026-07-10T12:00:00Z',
      tipo_de_forms: 'NPS',
      raw_payload: { form_response: { form_id: 'rzzF4ukM' } },
    };
    const a = resolveAnalyticalCycleForResponse(r, pharus, config[0], sourceCycles);
    assert.equal(a.analytical_cycle_code, 'NPS-2026-JUN-JUL-PHARUS');
    assert.equal(a.source_cycle_name, 'NPS 2026-T2');
    assert.equal(a.cycle_resolution_method, 'historical_jun_jul_reconstruction');

    const independent = getIndependentPharusSourceCycles(config);
    assert.ok(!independent.some((c) => c.cycle_code === 'NPS 2026-T2'));
  });

  it('B — pré-T2 PHARUS recebe mesmo analytical_cycle_code', () => {
    const r = {
      id: 'pre',
      client_id: 'c2',
      score: 9,
      submitted_at: '2026-06-20T12:00:00Z',
      tipo_de_forms: 'NPS',
      raw_payload: null,
    };
    const a = resolveAnalyticalCycleForResponse(r, pharus, config[0], sourceCycles);
    assert.equal(a.analytical_cycle_code, 'NPS-2026-JUN-JUL-PHARUS');
    assert.equal(a.legacy_payload_missing, true);
  });

  it('C — DAVOS não entra no ciclo PHARUS', () => {
    const r = {
      id: 'd1',
      client_id: 'c3',
      score: 10,
      submitted_at: '2026-06-20T12:00:00Z',
      tipo_de_forms: 'NPS',
      raw_payload: {},
    };
    const a = resolveAnalyticalCycleForResponse(r, davos, config[0], sourceCycles);
    assert.equal(a, null);
  });

  it('D/E — dedupe mantém apenas a mais recente por client_id + ciclo', () => {
    const rows = [
      {
        client_id: 'c1',
        analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
        submitted_at: '2026-06-16T00:00:00Z',
        score: 8,
        id: 'old',
      },
      {
        client_id: 'c1',
        analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS',
        submitted_at: '2026-07-07T00:00:00Z',
        score: 10,
        id: 'new',
      },
    ];
    const { kept, removed } = dedupeByClientAndAnalyticalCycle(rows);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, 'new');
    assert.equal(removed.length, 1);
  });

  it('F — source cycle não duplica analytical cycle PHARUS', () => {
    const responses = [
      {
        id: '1',
        client_id: 'a',
        score: 10,
        submitted_at: '2026-06-18T00:00:00Z',
        tipo_de_forms: 'NPS',
        raw_payload: null,
      },
      {
        id: '2',
        client_id: 'b',
        score: 9,
        submitted_at: '2026-07-15T00:00:00Z',
        tipo_de_forms: 'NPS',
        raw_payload: {},
      },
    ];
    const clients = new Map([
      ['a', pharus],
      ['b', pharus],
    ]);
    const ds = buildJunJulPharusDataset(responses, clients, config, sourceCycles);
    assert.equal(ds.raw_count, 2);
    assert.ok(ds.responses.every((r) => r.analytical_cycle_code === 'NPS-2026-JUN-JUL-PHARUS'));
  });

  it('G — NPS calculado após dedupe', () => {
    const rows = [
      { client_id: 'x', analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS', submitted_at: '2026-06-01', score: 10 },
      { client_id: 'x', analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS', submitted_at: '2026-07-01', score: 6 },
      { client_id: 'y', analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS', submitted_at: '2026-06-02', score: 10 },
    ];
    const { kept } = dedupeByClientAndAnalyticalCycle(rows);
    const summary = calculateNpsSummary(kept.map((r) => ({ score: r.score })));
    assert.equal(kept.length, 2);
    assert.equal(summary.total, 2);
    // x mantém score 6 (jul); y promotor 10 → NPS (1−1)/2 = 0
    assert.equal(summary.nps, 0);
  });

  it('Set/2026 — resposta em setembro vai para NPS-2026-SET-PHARUS, não Jun–Jul', () => {
    const r = {
      id: 'sep',
      client_id: 'c9',
      score: 10,
      submitted_at: '2026-09-20T12:00:00Z',
      tipo_de_forms: 'NPS',
      raw_payload: {},
    };
    const setDef = config.find((c) => c.cycle_code === 'NPS-2026-SET-PHARUS');
    const a = resolveAnalyticalCycleForResponse(r, pharus, setDef, sourceCycles);
    assert.equal(a.analytical_cycle_code, 'NPS-2026-SET-PHARUS');
    const jun = resolveAnalyticalCycleForResponse(r, pharus, config[0], sourceCycles);
    assert.equal(jun, null);
  });

  it('ends_at Jun–Jul vem do source cycle T2', () => {
    const bounds = resolveCycleBounds(config[0], sourceCycles);
    assert.equal(bounds.ends_at, '2026-08-13T02:59:59+00:00');
  });
});
