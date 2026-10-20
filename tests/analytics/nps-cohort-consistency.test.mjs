import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCohortSummaries } from '../../dashboard/js/data/historico2-view.mjs';
import {
  safrasCustomersFromHistorico2,
  buildSafrasCohortSummariesFromHistorico2Clients,
} from '../../dashboard/js/data/historico2-safras-adapter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SAFRAS = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'];
const SET = 'NPS-2026-SET-PHARUS';

function officialBoundsFromRepo() {
  const cycles = JSON.parse(readFileSync(join(ROOT, 'data/processed/cycles.json'), 'utf8'));
  const cycleDef = cycles.find((c) => c.cycle_code === SET);
  if (cycleDef?.type === 'source_cycle' && (cycleDef.starts_at || cycleDef.ends_at)) {
    return { starts_at: cycleDef.starts_at ?? null, ends_at: cycleDef.ends_at ?? null };
  }
  return null;
}

function cohortMap(rows) {
  return new Map(rows.map((r) => [r.entry_cohort, r]));
}

test('NPS por safra: buildCohortSummaries idêntico em Histórico e Safras (kernel único)', () => {
  const h2 = JSON.parse(
    readFileSync(join(ROOT, 'data/processed/historico2_clients_enriched.json'), 'utf8'),
  );
  const responses = JSON.parse(readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'));
  const officialBounds = officialBoundsFromRepo();
  const opts = { chartsFrom2025: true, responses, officialBounds };
  const historico = buildCohortSummaries(h2.clients, opts);
  const safras = buildSafrasCohortSummariesFromHistorico2Clients(h2.clients, {
    minYear: 2025,
    responses,
    officialBounds,
  });
  assert.equal(JSON.stringify(historico), JSON.stringify(safras));
});

test('NPS por safra: P, N, D, n e nota média batem por safra (2025-Q1 … 2026-Q3)', () => {
  const h2 = JSON.parse(
    readFileSync(join(ROOT, 'data/processed/historico2_clients_enriched.json'), 'utf8'),
  );
  const responses = JSON.parse(readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'));
  const officialBounds = officialBoundsFromRepo();
  const historico = cohortMap(
    buildCohortSummaries(h2.clients, { chartsFrom2025: true, responses, officialBounds }),
  );
  const safras = cohortMap(
    buildSafrasCohortSummariesFromHistorico2Clients(h2.clients, {
      minYear: 2025,
      responses,
      officialBounds,
    }),
  );
  for (const safra of SAFRAS) {
    const h = historico.get(safra);
    const s = safras.get(safra);
    if (!h && !s) continue;
    assert.ok(h && s, `safra ${safra} deve existir nas duas visões`);
    assert.equal(h.nps, s.nps, `${safra} nps`);
    assert.equal(h.nps_responses, s.nps_responses, `${safra} n`);
    assert.equal(h.clients, s.clients, `${safra} clients`);
    assert.equal(h.promoters, s.promoters, `${safra} P`);
    assert.equal(h.neutrals, s.neutrals, `${safra} N`);
    assert.equal(h.detractors, s.detractors, `${safra} D`);
    assert.equal(h.average_score, s.average_score, `${safra} avg`);
  }
});

test('BASE0 só entry_date no adapter Safras', () => {
  const h2 = JSON.parse(
    readFileSync(join(ROOT, 'data/processed/historico2_clients_enriched.json'), 'utf8'),
  );
  const row = safrasCustomersFromHistorico2(h2)[0];
  assert.equal(row.attributes_source, 'base_qv');
  assert.match(row.entry_date_source ?? '', /base0/i);
  assert.ok(!row.client_name?.match(/^[A-Z][a-z]+ [A-Z]\.$/), 'nome não deve vir abreviado');
});
