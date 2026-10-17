import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveCurrentNpsSummary } from '../../dashboard/js/data/executive-official-nps.mjs';
import { buildHistorico2ExecutiveKpis } from '../../dashboard/js/data/historico2-executive-kpis.mjs';
import { buildMeasurementChartSeriesForPage } from '../../dashboard/js/data/nps-historico-measurements-view.mjs';
import { cycleSortKey } from '../../lib/analytics/nps-cycle-canonical.mjs';
import { MEASUREMENTS_SINCE } from '../../lib/analytics/nps-historico-official.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SET = 'NPS-2026-SET-PHARUS';
const CONSOLIDATED_PATH = join(ROOT, 'data/processed/nps_measurements_consolidated.json');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

describe('nps_measurements_consolidated', () => {
  const responses = loadJson('data/processed/responses.json');
  const cycles = loadJson('data/processed/cycles.json');
  const summary = loadJson('data/processed/cycle_summary.json').cycles.find((c) => c.cycle_code === SET);
  const cycleDef = cycles.find((c) => c.cycle_code === SET);

  it('dataset materializado (skip se ausente)', { skip: !existsSync(CONSOLIDATED_PATH) }, () => {
    const doc = JSON.parse(readFileSync(CONSOLIDATED_PATH, 'utf8'));
    assert.ok(doc.measurements?.length > 2);
    assert.ok(cycleSortKey(doc.measurements[0].cycle) >= cycleSortKey(MEASUREMENTS_SINCE));
  });

  it('measurements.length > 2 quando histórico oficial existe', { skip: !existsSync(CONSOLIDATED_PATH) }, () => {
    const doc = JSON.parse(readFileSync(CONSOLIDATED_PATH, 'utf8'));
    assert.ok(doc.measurements.length > 2);
  });

  it('primeiro ciclo >= 2025-Q2 e último = ciclo atual', { skip: !existsSync(CONSOLIDATED_PATH) }, () => {
    const doc = JSON.parse(readFileSync(CONSOLIDATED_PATH, 'utf8'));
    const first = doc.measurements[0].cycle;
    const last = doc.measurements[doc.measurements.length - 1].cycle;
    assert.ok(cycleSortKey(first) >= cycleSortKey('2025-Q2'));
    assert.equal(last, doc.meta.current_cycle_label);
  });

  it('último ponto == KPI == Executivo', { skip: !existsSync(CONSOLIDATED_PATH) }, () => {
    const consolidatedDoc = JSON.parse(readFileSync(CONSOLIDATED_PATH, 'utf8'));
    const baseQvDoc = loadJson('data/processed/nps_measurements_baseqv.json');
    const historico2Doc = loadJson('data/processed/historico2_clients_enriched.json');
    const series = buildMeasurementChartSeriesForPage({
      consolidatedDoc,
      baseQvDoc,
      responses,
      cycles,
      historico2Doc,
      filteredClients: historico2Doc.clients,
      clientFilters: {},
    });
    const last = series[series.length - 1];
    const executive = buildExecutiveCurrentNpsSummary(responses, summary, cycleDef);
    const kpis = buildHistorico2ExecutiveKpis({
      filteredClients: historico2Doc.clients.slice(0, 1),
      clientFilters: {},
      enrichedDoc: { responses: [] },
      responses,
      cycleDef,
      cycleSummaryTemplate: summary,
      historicalSummaryDoc: null,
      liveOfficialSummary: null,
      livePreviousOfficialSummary: null,
      currentCycleCode: SET,
    });
    assert.equal(last.responses, executive.valid_responses);
    assert.equal(last.responses, kpis.cycleResponses);
    assert.ok(Math.abs(last.nps - executive.nps) < 0.01);
  });

  it('P + N + D == respostas em cada medição', { skip: !existsSync(CONSOLIDATED_PATH) }, () => {
    const doc = JSON.parse(readFileSync(CONSOLIDATED_PATH, 'utf8'));
    for (const m of doc.measurements) {
      const total = (m.promoters ?? 0) + (m.neutrals ?? 0) + (m.detractors ?? 0);
      assert.equal(total, m.responses ?? m.valid_responses, m.cycle);
    }
  });
});
