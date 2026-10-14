import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  aggregateHistoricoPndByCanonicalCycle,
  listHistoricoDetractorsForCycle,
} from '../../lib/analytics/historico-cycle-pnd.mjs';
import { prepareHistoricoDisplayCycles } from '../../dashboard/js/utils/nps-cycle-labels.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const enrichedPath = join(root, 'data/deploy/public/processed/historical_nps_enriched.json');
const summaryPath = join(root, 'data/deploy/public/processed/historical_nps_summary.json');

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('historico cycle P/N/D', () => {
  const enriched = loadJson(enrichedPath);
  const rows = enriched.responses ?? [];
  const pndMap = aggregateHistoricoPndByCanonicalCycle(rows);

  it('percentuais somam ~100% por ciclo', () => {
    for (const [, pnd] of pndMap) {
      if (!pnd.valid) continue;
      assert.equal(pnd.promotores + pnd.neutros + pnd.detratores, pnd.valid);
      const sum =
        (pnd.pct_promotores ?? 0) + (pnd.pct_neutros ?? 0) + (pnd.pct_detratores ?? 0);
      assert.ok(Math.abs(sum - 100) < 0.2, `pct sum ${sum} for ${pnd.ciclo}`);
    }
  });

  it('2026-Q2 possui detratores no dataset canônico', () => {
    const q2 = pndMap.get('2026-Q2');
    assert.ok(q2, '2026-Q2 missing');
    assert.ok(q2.detratores > 0, `expected detractors, got ${q2.detratores}`);
    assert.equal(q2.valid, q2.promotores + q2.neutros + q2.detratores);
  });

  it('Fernanda e Gisele Krüger entram como detratores em 2026-Q2', () => {
    const dets = listHistoricoDetractorsForCycle(rows, '2026-Q2');
    const names = dets.map((d) => d.client_name);
    assert.ok(names.some((n) => n.includes('Fernanda Cristina de Oliveira')));
    assert.ok(names.some((n) => n.includes('Gisele C T Krüger')));
  });

  it('prepareHistoricoDisplayCycles mescla P/N/D da amostra técnica', () => {
    const summary = loadJson(summaryPath);
    const merged = prepareHistoricoDisplayCycles(summary.summary?.cycles ?? []);
    const q2 = merged.find((c) => c.ciclo === '2026-Q2');
    assert.ok(q2);
    assert.ok(q2.detratores > 0, 'chart row should include detractors');
    assert.ok(q2.respostas_derivadas >= 200);
  });
});
