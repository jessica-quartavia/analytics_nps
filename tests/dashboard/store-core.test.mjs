import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getLatestCycleBySequence,
  getPreviousCycleCode,
  buildSummaryMap,
  filterResponses,
  movementKpis,
  migrationCellKey,
} from '../../dashboard/js/data/store-core.mjs';

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '../../data/processed');

function loadJson(name) {
  return JSON.parse(readFileSync(join(dataRoot, name), 'utf8'));
}

describe('dashboard store-core', () => {
  it('seleciona latest cycle por sequence', () => {
    const cycles = loadJson('cycles.json');
    const latest = getLatestCycleBySequence(cycles);
    assert.equal(latest.cycle_code, 'NPS-2026-SET-PHARUS');
    assert.equal(latest.cycle_name, 'Set/2026');
  });

  it('resolve ciclo anterior', () => {
    const cycles = loadJson('cycles.json');
    const prev = getPreviousCycleCode(cycles, 'NPS-2026-SET-PHARUS');
    assert.equal(prev, 'NPS-2026-JUN-JUL-PHARUS');
  });

  it('delta visual a partir de summaries (não recalcula NPS)', () => {
    const doc = loadJson('cycle_summary.json');
    const map = buildSummaryMap(doc);
    const cur = map.get('NPS-2026-SET-PHARUS');
    const prev = map.get('NPS-2026-JUN-JUL-PHARUS');
    const delta = cur.nps - prev.nps;
    assert.ok(Math.abs(delta - -12.108811904) < 0.0001);
  });

  it('filtro base pareada restringe clientes', () => {
    const paired = JSON.parse(readFileSync(join(dataRoot, 'paired_cycles.json'), 'utf8'));
    const responses = loadJson('responses.json').filter(
      (r) => r.analytical_cycle_code === 'NPS-2026-SET-PHARUS' && r.previous_score != null,
    );
    const pairedSet = new Set(paired.paired_client_ids);
    const filtered = filterResponses(
      responses,
      { base: 'paired' },
      { pairedClientIds: pairedSet },
    );
    assert.equal(filtered.length, paired.paired_clients);
  });

  it('filtro migration cell com seta unicode', () => {
    const rows = [
      { nps_migration: 'Promotor → Neutro', client_id: 'a' },
      { nps_migration: 'Promotor → Promotor', client_id: 'b' },
    ];
    const key = migrationCellKey('Promotor', 'Neutro');
    const out = filterResponses(rows, { migrationCell: key });
    assert.equal(out.length, 1);
    assert.equal(out[0].client_id, 'a');
  });

  it('movementKpis ignora sem previous_score', () => {
    const rows = [
      { previous_score: 10, evolution_status: 'Estável' },
      { previous_score: null, evolution_status: null },
      { previous_score: 6, evolution_status: 'Queda severa' },
    ];
    const k = movementKpis(rows);
    assert.equal(k.paired, 2);
    assert.equal(k.severe, 1);
  });
});
