import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveCurrentNpsSummary } from '../../dashboard/js/data/executive-official-nps.mjs';
import { buildHistorico2ExecutiveKpis } from '../../dashboard/js/data/historico2-executive-kpis.mjs';
import { buildSafrasMeasurementChartSeries, officialMeasurementKpiFromSeries } from '../../dashboard/js/data/safras-measurements-view.mjs';
import { defaultSafrasFilters } from '../../dashboard/js/data/safras-cobertura-view.mjs';
import { defaultHistorico2Filters } from '../../dashboard/js/data/historico2-view.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SET = 'NPS-2026-SET-PHARUS';
const CONSOLIDATED_PATH = join(ROOT, 'data/processed/nps_measurements_consolidated.json');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function assertCurrentParity(label, executive, other) {
  assert.equal(other.responses, executive.responses, `${label} n`);
  assert.equal(other.promoters, executive.promoters, `${label} P`);
  assert.equal(other.neutrals, executive.neutrals, `${label} N`);
  assert.equal(other.detractors, executive.detractors, `${label} D`);
  assert.equal(other.nps, executive.nps, `${label} NPS`);
}

test('ciclo atual operacional: Executivo === Histórico === Safras (≠ 408/63,7 audit)', {
  skip: !existsSync(CONSOLIDATED_PATH),
}, () => {
  const responses = loadJson('data/processed/responses.json');
  const cycles = loadJson('data/processed/cycles.json');
  const cycleDef = cycles.find((c) => c.cycle_code === SET);
  const template = loadJson('data/processed/cycle_summary.json').cycles.find(
    (c) => c.cycle_code === SET,
  );
  const historico2Doc = loadJson('data/processed/historico2_clients_enriched.json');
  const consolidatedDoc = loadJson('data/processed/nps_measurements_consolidated.json');
  const baseQvDoc = loadJson('data/processed/nps_measurements_baseqv.json');

  const executive = buildExecutiveCurrentNpsSummary(responses, template, cycleDef);
  const executiveSlice = {
    responses: executive.valid_responses,
    promoters: executive.promoters,
    neutrals: executive.passives,
    detractors: executive.detractors,
    nps: executive.nps,
  };

  assert.notEqual(executiveSlice.responses, 408, 'KPI operacional não deve usar janela T3 completa (408)');
  assert.ok(Math.abs(executiveSlice.nps - 63.725490196078425) > 0.01, 'NPS operacional ≠ 63,7 audit T3');

  const historicoKpis = buildHistorico2ExecutiveKpis({
    filteredClients: historico2Doc.clients,
    clientFilters: defaultHistorico2Filters(),
    enrichedDoc: { responses: [] },
    responses,
    cycleDef,
    cycleSummaryTemplate: template,
    historicalSummaryDoc: null,
    liveOfficialSummary: executive,
    livePreviousOfficialSummary: null,
    currentCycleCode: SET,
  });

  const historicoSlice = {
    responses: historicoKpis.cycleResponses,
    promoters: historicoKpis.cycleOfficial?.promoters,
    neutrals: historicoKpis.cycleOfficial?.passives,
    detractors: historicoKpis.cycleOfficial?.detractors,
    nps: historicoKpis.cycleOfficial?.nps,
  };
  assertCurrentParity('historico', executiveSlice, historicoSlice);

  const series = buildSafrasMeasurementChartSeries({
    consolidatedDoc,
    baseQvDoc,
    responses,
    cycles,
    historico2Doc,
    filteredSafrasCustomers: historico2Doc.clients,
    pageFilters: defaultSafrasFilters(),
    cycleSummaryTemplate: template,
  });
  const safrasKpi = officialMeasurementKpiFromSeries(series, consolidatedDoc);
  const safrasSlice = {
    responses: safrasKpi.responses,
    promoters: safrasKpi.promoters,
    neutrals: safrasKpi.neutrals,
    detractors: safrasKpi.detractors,
    nps: safrasKpi.nps,
  };
  assertCurrentParity('safras', executiveSlice, safrasSlice);
  assert.ok(safrasKpi.analytical_cycle === SET, 'metadata analytical_cycle');
  assert.ok(safrasKpi.universe, 'metadata universe');
});
