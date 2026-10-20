import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCanonicalMeasurementSeries } from '../../dashboard/js/data/nps-historico-measurements-view.mjs';
import { buildSafrasMeasurementChartSeries } from '../../dashboard/js/data/safras-measurements-view.mjs';
import { defaultSafrasFilters } from '../../dashboard/js/data/safras-cobertura-view.mjs';
import { defaultHistorico2Filters } from '../../dashboard/js/data/historico2-view.mjs';
import { cycleSortKey } from '../../lib/analytics/nps-cycle-canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CONSOLIDATED_PATH = join(ROOT, 'data/processed/nps_measurements_consolidated.json');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function seriesMap(series) {
  return new Map((series ?? []).map((r) => [r.measurement, r]));
}

test('NPS por medição: Histórico === Safras sem recorte (série canônica)', {
  skip: !existsSync(CONSOLIDATED_PATH),
}, () => {
  const consolidatedDoc = loadJson('data/processed/nps_measurements_consolidated.json');
  const baseQvDoc = loadJson('data/processed/nps_measurements_baseqv.json');
  const historico2Doc = loadJson('data/processed/historico2_clients_enriched.json');
  const responses = loadJson('data/processed/responses.json');
  const cycles = loadJson('data/processed/cycles.json');
  const pageFilters = defaultSafrasFilters();

  const historico = getCanonicalMeasurementSeries({
    consolidatedDoc,
    baseQvDoc,
    responses,
    cycles,
    historico2Doc,
    filteredClients: historico2Doc.clients,
    clientFilters: defaultHistorico2Filters(),
  });

  const safras = buildSafrasMeasurementChartSeries({
    consolidatedDoc,
    baseQvDoc,
    responses,
    cycles,
    historico2Doc,
    filteredSafrasCustomers: historico2Doc.clients,
    pageFilters,
  });

  assert.equal(JSON.stringify(historico), JSON.stringify(safras));

  const hMap = seriesMap(historico);
  const sMap = seriesMap(safras);
  const cyclesAll = [...new Set([...hMap.keys(), ...sMap.keys()])].sort(
    (a, b) => cycleSortKey(a) - cycleSortKey(b),
  );

  for (const cycle of cyclesAll) {
    const h = hMap.get(cycle);
    const s = sMap.get(cycle);
    assert.ok(h && s, `medição ${cycle} deve existir nas duas séries`);
    assert.equal(h.responses, s.responses, `${cycle} responses`);
    assert.equal(h.distinct_clients, s.distinct_clients, `${cycle} unique_clients`);
    assert.equal(h.promoters, s.promoters, `${cycle} promoters`);
    assert.equal(h.neutrals, s.neutrals, `${cycle} neutrals`);
    assert.equal(h.detractors, s.detractors, `${cycle} detractors`);
    assert.equal(h.nps, s.nps, `${cycle} nps`);
    assert.equal(h.average_score, s.average_score, `${cycle} average_score`);
  }
});
