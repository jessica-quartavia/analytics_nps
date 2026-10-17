import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveCurrentNpsSummary } from '../../dashboard/js/data/executive-official-nps.mjs';
import { buildHistorico2ExecutiveKpis } from '../../dashboard/js/data/historico2-executive-kpis.mjs';
import { buildMeasurementChartSeriesForPage } from '../../dashboard/js/data/nps-historico-measurements-view.mjs';
import { cycleSortKey } from '../../lib/analytics/nps-cycle-canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SET = 'NPS-2026-SET-PHARUS';
const BASEQV_PATH = join(ROOT, 'data/processed/nps_measurements_baseqv.json');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

describe('nps_measurements_baseqv (BASE QV oficial)', () => {
  const responses = loadJson('data/processed/responses.json');
  const cycles = loadJson('data/processed/cycles.json');
  const summary = loadJson('data/processed/cycle_summary.json').cycles.find((c) => c.cycle_code === SET);
  const cycleDef = cycles.find((c) => c.cycle_code === SET);

  it('materializado existe após generate (skip se ausente)', { skip: !existsSync(BASEQV_PATH) }, () => {
    const doc = JSON.parse(readFileSync(BASEQV_PATH, 'utf8'));
    assert.equal(doc.meta?.source?.includes('BASE_QV'), true);
    assert.ok(doc.measurements?.length >= 1);
    assert.ok(doc.response_index?.length >= 1);
    assert.ok(doc.analytical_cycles_config?.length >= 1);
  });

  it('A/B — última medição == KPI ciclo atual == Executivo (default)', { skip: !existsSync(BASEQV_PATH) }, () => {
    const baseQvDoc = JSON.parse(readFileSync(BASEQV_PATH, 'utf8'));
    const historico2Doc = loadJson('data/processed/historico2_clients_enriched.json');
    const series = buildMeasurementChartSeriesForPage({
      baseQvDoc,
      responses,
      cycles,
      historico2Doc,
      filteredClients: historico2Doc.clients,
      clientFilters: {},
    });
    assert.ok(series.length >= 1);
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
  });

  it('C — P + N + D == respostas consideradas', { skip: !existsSync(BASEQV_PATH) }, () => {
    const doc = JSON.parse(readFileSync(BASEQV_PATH, 'utf8'));
    for (const m of doc.measurements) {
      const total = (m.promoters ?? 0) + (m.neutrals ?? 0) + (m.detractors ?? 0);
      assert.equal(total, m.valid_responses, m.label);
    }
  });

  it('D — ciclos ordenados cronologicamente', { skip: !existsSync(BASEQV_PATH) }, () => {
    const doc = JSON.parse(readFileSync(BASEQV_PATH, 'utf8'));
    const keys = doc.measurements.map((m) => cycleSortKey(m.label));
    for (let i = 1; i < keys.length; i += 1) {
      assert.ok(keys[i] >= keys[i - 1]);
    }
  });

  it('E — labels canônicos únicos (sem alias duplicado)', { skip: !existsSync(BASEQV_PATH) }, () => {
    const doc = JSON.parse(readFileSync(BASEQV_PATH, 'utf8'));
    const labels = doc.measurements.map((m) => m.label);
    assert.equal(new Set(labels).size, labels.length);
  });

  it('F — série default não depende de filtro safra implícito', { skip: !existsSync(BASEQV_PATH) }, () => {
    const baseQvDoc = JSON.parse(readFileSync(BASEQV_PATH, 'utf8'));
    const historico2Doc = loadJson('data/processed/historico2_clients_enriched.json');
    const full = buildMeasurementChartSeriesForPage({
      baseQvDoc,
      responses,
      cycles,
      historico2Doc,
      filteredClients: historico2Doc.clients,
      clientFilters: {},
    });
    const subset = buildMeasurementChartSeriesForPage({
      baseQvDoc,
      responses,
      cycles,
      historico2Doc,
      filteredClients: historico2Doc.clients.slice(0, 50),
      clientFilters: {},
    });
    const lastFull = full[full.length - 1]?.responses;
    const lastSub = subset[subset.length - 1]?.responses;
    assert.equal(lastFull, lastSub);
  });
});
