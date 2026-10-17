import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveCurrentNpsSummary } from '../../dashboard/js/data/executive-official-nps.mjs';
import { buildHistorico2ExecutiveKpis } from '../../dashboard/js/data/historico2-executive-kpis.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SET = 'NPS-2026-SET-PHARUS';

describe('NPS Histórico × Executivo (ciclo atual)', () => {
  const responses = JSON.parse(readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'));
  const cycles = JSON.parse(readFileSync(join(ROOT, 'data/processed/cycles.json'), 'utf8'));
  const summary = JSON.parse(readFileSync(join(ROOT, 'data/processed/cycle_summary.json'), 'utf8')).cycles.find(
    (c) => c.cycle_code === SET,
  );
  const cycleDef = cycles.find((c) => c.cycle_code === SET);

  it('default (sem filtros) — respostas e NPS iguais ao kernel Executivo', () => {
    const executive = buildExecutiveCurrentNpsSummary(responses, summary, cycleDef);
    const historico = buildHistorico2ExecutiveKpis({
      filteredClients: [{ client_id: 'any' }],
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

    assert.equal(historico.cycleResponses, executive.valid_responses);
    assert.ok(Math.abs(historico.officialNps - executive.nps) < 1e-9);
    assert.equal(historico.cycleOfficial.promoters, executive.promoters);
    assert.equal(historico.cycleOfficial.passives, executive.passives);
    assert.equal(historico.cycleOfficial.detractors, executive.detractors);
  });
});
