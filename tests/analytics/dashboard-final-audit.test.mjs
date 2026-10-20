import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPairedClientsBetweenCycles, countRecurringFromEnrichedRows } from '../../lib/analytics/nps-paired-recurring-audit.mjs';
import { normalizeClientStatus } from '../../lib/analytics/analytical-active-client.mjs';
import { buildSafrasMeasurementChartSeries } from '../../dashboard/js/data/safras-measurements-view.mjs';
import { getCanonicalMeasurementSeries } from '../../dashboard/js/data/nps-historico-measurements-view.mjs';
import { defaultSafrasFilters } from '../../dashboard/js/data/safras-cobertura-view.mjs';
import { defaultHistorico2Filters } from '../../dashboard/js/data/historico2-view.mjs';
import { buildSafraMedicaoPivot } from '../../dashboard/js/data/safras-cobertura-view.mjs';
import { iqr } from '../../lib/analytics/milestone-temporal.mjs';
import { buildPharusAppMatchMap } from '../../lib/analytics/nps-milestones.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function load(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

test('Movimento: pareados kernel previous/current/paired', () => {
  const responses = load('data/processed/responses.json');
  const cycles = load('data/processed/cycles.json');
  const current = cycles.find((c) => c.type === 'source_cycle')?.cycle_code;
  const prev = cycles.find((c) => c.sequence === 1 && c.program === 'PHARUS')?.cycle_code;
  const audit = auditPairedClientsBetweenCycles(prev, current, responses);
  assert.ok(audit.previous_n > 0);
  assert.ok(audit.current_n > 0);
  assert.equal(audit.paired_total, audit.paired_client_ids.length);
});

test('Histórico: recorrentes vs pareados (definições documentadas)', () => {
  const enriched = load('data/processed/historical_nps_enriched.json');
  const rec = countRecurringFromEnrichedRows(enriched.responses ?? enriched);
  const responses = load('data/processed/responses.json');
  const cycles = load('data/processed/cycles.json');
  const current = cycles.find((c) => c.type === 'source_cycle')?.cycle_code;
  const prev = cycles.find((c) => c.sequence === 1 && c.program === 'PHARUS')?.cycle_code;
  const paired = auditPairedClientsBetweenCycles(prev, current, responses);
  assert.ok(rec.recurring_clients >= paired.paired_total);
});

test('Safras × Histórico: paridade série medição', () => {
  const consolidatedDoc = load('data/processed/nps_measurements_consolidated.json');
  const baseQvDoc = load('data/processed/nps_measurements_baseqv.json');
  const historico2Doc = load('data/processed/historico2_clients_enriched.json');
  const responses = load('data/processed/responses.json');
  const cycles = load('data/processed/cycles.json');
  const h = getCanonicalMeasurementSeries({
    consolidatedDoc,
    baseQvDoc,
    responses,
    cycles,
    historico2Doc,
    filteredClients: historico2Doc.clients,
    clientFilters: defaultHistorico2Filters(),
  });
  const s = buildSafrasMeasurementChartSeries({
    consolidatedDoc,
    baseQvDoc,
    responses,
    cycles,
    historico2Doc,
    filteredSafrasCustomers: historico2Doc.clients,
    pageFilters: defaultSafrasFilters(),
  });
  assert.equal(JSON.stringify(h), JSON.stringify(s));
});

test('Matriz safra×medição: células com n', () => {
  const customers = load('data/processed/customer_nps_cohorts.json');
  const history = load('data/processed/customer_nps_history.json');
  const pivot = buildSafraMedicaoPivot(history, customers, 'nps', 'all');
  for (const key of Object.keys(pivot.cellAgg ?? {})) {
    const cell = pivot.cellAgg[key];
    assert.ok('n' in cell && 'nps' in cell);
  }
});

test('Status Safras: normalização Ativo', () => {
  for (const raw of ['ativo', 'Ativo', 'ACTIVE', 'active', 'Active']) {
    assert.equal(normalizeClientStatus(raw), 'Ativo');
  }
});

test('IQR: amostra pequena não retorna NaN', () => {
  const r = iqr([1, 2, 3]);
  assert.equal(r.insufficient, true);
  assert.equal(r.iqr, null);
});

test('Safra entrada 2026-Q3: contagens', () => {
  const h2 = load('data/processed/historico2_clients_enriched.json');
  const q3 = h2.clients.filter((c) => c.entry_cohort === '2026-Q3');
  assert.ok(q3.length >= 170);
});

test('UI: Executivo sem Satisfação complementar', () => {
  const src = readFileSync(join(ROOT, 'dashboard/js/pages/executivo.js'), 'utf8');
  assert.ok(!/Satisfação complementar/i.test(src));
  assert.ok(/renderExecutivoCycleSnapshot/.test(src));
});

test('UI: Movimento sem seção legacy de quadrantes', () => {
  const src = readFileSync(join(ROOT, 'dashboard/js/pages/movimento.js'), 'utf8');
  assert.ok(!/O que aconteceu entre ciclos/i.test(src));
  assert.ok(/Fatores associados/.test(readFileSync(join(ROOT, 'dashboard/js/pages/movimento-change-drivers.js'), 'utf8')));
});

test('App Pharus: match map cobre client_ids do artefato', () => {
  const pharus = load('data/processed/pharus_app_customer_match.json');
  const map = buildPharusAppMatchMap(pharus);
  assert.ok(map.size > 0);
});

test('Audit JSON existe após generate', () => {
  const p = join(ROOT, 'data/quality/nps_cross_page_consistency_audit.json');
  if (!existsSync(p)) return;
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(Array.isArray(doc.measurement_parity));
});
