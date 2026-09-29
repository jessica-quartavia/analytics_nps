import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isClientRecorteActive,
  summaryLikeFromResponses,
  buildFilteredMigrationMatrix,
  filterCycleResponses,
  buildFilterOptionsForCycle,
} from '../../dashboard/js/data/store-core.mjs';
import { buildGlobalFilterContext as buildCtx } from '../../dashboard/js/filters/filter-context.mjs';

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '../../data/processed');

function loadJson(name) {
  return JSON.parse(readFileSync(join(dataRoot, name), 'utf8'));
}

const CYCLE = 'NPS-2026-SET-PHARUS';
const PREV = 'NPS-2026-JUN-JUL-PHARUS';

describe('global filters — store-core', () => {
  const responses = loadJson('responses.json');
  const paired = loadJson('paired_cycles.json');
  const cycles = loadJson('cycles.json');
  const cycleSummary = loadJson('cycle_summary.json');
  const summaryMap = new Map(cycleSummary.cycles.map((c) => [c.cycle_code, c]));

  it('EP: contagem muda com filtro de carteira', () => {
    const all = filterCycleResponses(responses, CYCLE, {}, {});
    const opts = buildFilterOptionsForCycle({
      pairedDoc: paired,
      actionQueue: [],
      clientSatMap: new Map(),
      cycleCode: CYCLE,
      filters: { base: 'total' },
    });
    const eps = [...new Set(all.map((r) => r.ep_name).filter(Boolean))];
    assert.ok(eps.length > 1);
    const oneEp = eps[0];
    const filtered = filterCycleResponses(
      responses,
      CYCLE,
      { ep: oneEp },
      opts,
    );
    assert.ok(filtered.length < all.length);
    assert.ok(filtered.every((r) => r.ep_name === oneEp));
  });

  it('Categoria Promotor retorna só promotores', () => {
    const opts = buildFilterOptionsForCycle({
      pairedDoc: paired,
      actionQueue: [],
      clientSatMap: new Map(),
      cycleCode: CYCLE,
      filters: {},
    });
    const out = filterCycleResponses(
      responses,
      CYCLE,
      { category: 'Promotor' },
      opts,
    );
    assert.ok(out.length > 0);
    assert.ok(out.every((r) => r.nps_category === 'Promotor'));
  });

  it('Nota 8–10 remove notas abaixo de 8', () => {
    const opts = buildFilterOptionsForCycle({
      pairedDoc: paired,
      actionQueue: [],
      clientSatMap: new Map(),
      cycleCode: CYCLE,
      filters: {},
    });
    const out = filterCycleResponses(
      responses,
      CYCLE,
      { scoreMin: '8', scoreMax: '10' },
      opts,
    );
    assert.ok(out.every((r) => r.score >= 8 && r.score <= 10));
  });

  it('Delta: somente clientes no intervalo', () => {
    const opts = buildFilterOptionsForCycle({
      pairedDoc: paired,
      actionQueue: [],
      clientSatMap: new Map(),
      cycleCode: CYCLE,
      filters: {},
    });
    const out = filterCycleResponses(
      responses,
      CYCLE,
      { deltaMin: '1', deltaMax: '10', withPreviousOnly: true },
      opts,
    );
    assert.ok(out.every((r) => r.score_delta != null && r.score_delta >= 1 && r.score_delta <= 10));
  });

  it('Base pareada: n igual à população pareada do ciclo', () => {
    const pairedSet = new Set(paired.paired_client_ids);
    const opts = buildFilterOptionsForCycle({
      pairedDoc: paired,
      actionQueue: [],
      clientSatMap: new Map(),
      cycleCode: CYCLE,
      filters: { base: 'paired' },
    });
    const out = filterCycleResponses(responses, CYCLE, { base: 'paired' }, opts);
    assert.equal(out.length, paired.paired_clients);
    assert.ok(out.every((r) => pairedSet.has(r.client_id)));
  });

  it('summaryLikeFromResponses difere do summary oficial com EP', () => {
    const official = summaryMap.get(CYCLE);
    const eps = [...new Set(filterCycleResponses(responses, CYCLE, {}, {}).map((r) => r.ep_name))];
    const rows = filterCycleResponses(responses, CYCLE, { ep: eps[0] }, {});
    const recorte = summaryLikeFromResponses(rows, official);
    assert.notEqual(recorte.valid_responses, official.valid_responses);
    assert.ok(isClientRecorteActive({ ep: eps[0] }));
  });

  it('matriz filtrada reduz células vs matriz cheia para um EP', () => {
    const eps = [...new Set(filterCycleResponses(responses, CYCLE, {}, {}).map((r) => r.ep_name))];
    const rows = filterCycleResponses(responses, CYCLE, { ep: eps[0] }, {});
    const full = buildFilteredMigrationMatrix(PREV, CYCLE, responses, filterCycleResponses(responses, CYCLE, {}, {}));
    const cut = buildFilteredMigrationMatrix(PREV, CYCLE, responses, rows);
    const fullSum = full.cells.reduce((a, c) => a + c.count, 0);
    const cutSum = cut.cells.reduce((a, c) => a + c.count, 0);
    assert.ok(cutSum <= fullSum);
    assert.ok(cutSum > 0);
  });

  it('buildGlobalFilterContext marca recorte e pairedDisplay', () => {
    const ctx = buildCtx({
      cycleCode: CYCLE,
      filters: { base: 'paired' },
      responses,
      cycles,
      pairedDoc: paired,
      migrationDoc: loadJson('migration_matrix.json'),
      actionQueue: [],
      clientSatMap: new Map(),
      officialSummary: summaryMap.get(CYCLE),
      previousOfficialSummary: summaryMap.get(PREV),
    });
    assert.equal(ctx.recorteActive, true);
    assert.equal(ctx.rowsCurrent.length, paired.paired_clients);
    assert.ok(ctx.pairedDisplay.paired_clients <= ctx.rowsMovement.length);
  });
});
