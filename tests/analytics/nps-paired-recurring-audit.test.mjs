import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditPairedClientsBetweenCycles,
  countRecurringFromEnrichedRows,
} from '../../lib/analytics/nps-paired-recurring-audit.mjs';
import { buildNpsByEntryCohort } from '../../lib/analytics/nps-cohort-nps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('pareados usam dedupe e score válido por ciclo', () => {
  const responses = JSON.parse(readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'));
  const pairedDoc = JSON.parse(readFileSync(join(ROOT, 'data/processed/paired_cycles.json'), 'utf8'));
  const audit = auditPairedClientsBetweenCycles(
    pairedDoc.previous_cycle,
    pairedDoc.current_cycle,
    responses,
  );
  assert.ok(audit.previous_n >= audit.paired_n);
  assert.ok(audit.current_n >= audit.paired_n);
});

test('pareados batem paired_cycles.json materializado', () => {
  const responses = JSON.parse(readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'));
  const pairedDoc = JSON.parse(readFileSync(join(ROOT, 'data/processed/paired_cycles.json'), 'utf8'));
  const audit = auditPairedClientsBetweenCycles(
    pairedDoc.previous_cycle,
    pairedDoc.current_cycle,
    responses,
  );
  assert.equal(audit.paired_total, pairedDoc.paired_clients);
});

test('recorrentes != pareados (definições distintas)', () => {
  const enriched = JSON.parse(
    readFileSync(join(ROOT, 'data/processed/historical_nps_enriched.json'), 'utf8'),
  );
  const rows = enriched.responses ?? enriched;
  const recurring = countRecurringFromEnrichedRows(rows);
  const pairedDoc = JSON.parse(readFileSync(join(ROOT, 'data/processed/paired_cycles.json'), 'utf8'));
  assert.ok(recurring.recurring_clients >= pairedDoc.paired_clients);
});

test('buildNpsByEntryCohort retorna n e NPS', () => {
  const h2 = JSON.parse(
    readFileSync(join(ROOT, 'data/processed/historico2_clients_enriched.json'), 'utf8'),
  );
  const cohorts = buildNpsByEntryCohort(h2.clients, { minYear: 2025 });
  const q3 = cohorts.find((c) => c.safra === '2026-Q3');
  assert.ok(q3);
  assert.ok(q3.clients >= q3.n);
});
