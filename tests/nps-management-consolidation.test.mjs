import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  countT1CriteriaOverlap,
  assertTierDistribution,
} from '../lib/analytics/financial-tier.mjs';
import {
  crossCheckManagementSources,
  buildManagementInsights,
} from '../lib/analytics/nps-management-insights.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'processed');
const qualityRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'quality');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

function loadQuality(rel) {
  return JSON.parse(readFileSync(join(qualityRoot, rel), 'utf8'));
}

describe('ETAPA 4.8 — consolidação gerencial', () => {
  it('253 entradas financeiras e tier soma 253', () => {
    const profile = loadJson('nps_financial_profile.json');
    assert.equal(profile.entries.length, 253);
    const d = profile.financial_profile_coverage.tier_distribution;
    const check = assertTierDistribution(d, 253);
    assert.equal(check.ok, true);
    assert.equal(d.T1, 67);
    assert.equal(d.T2, 48);
    assert.equal(d.T3, 98);
    assert.equal(d.T4, 27);
    assert.equal(d.unavailable, 13);
  });

  it('tier_reason overlap — critérios T1 não somam n T1', () => {
    const profile = loadJson('nps_financial_profile.json');
    const overlap = countT1CriteriaOverlap(profile.entries.filter((e) => e.tier === 'T1'));
    assert.equal(overlap.n_t1, 67);
    const sumCriteria =
      overlap.income_ge_100k + overlap.reserve_ge_500k + overlap.contribution_ge_30k;
    assert.ok(sumCriteria >= overlap.n_t1);
    assert.ok(sumCriteria > overlap.n_t1, 'esperado overlap > n T1');
  });

  it('financial_source por linha e contagens', () => {
    const profile = loadJson('nps_financial_profile.json');
    const allowed = new Set(['raw_snapshot', 'fallback_export', 'missing']);
    for (const e of profile.entries) {
      assert.ok(allowed.has(e.financial_source), `invalid source ${e.financial_source}`);
    }
    const c = profile.financial_profile_coverage.financial_source_counts;
    assert.equal(c.raw_snapshot + c.fallback_export + c.missing, 253);
    assert.equal(c.fallback_export, 253);
    assert.equal(c.raw_snapshot, 0);
    assert.ok(profile.financial_profile_coverage.do_not_label_as_full_base_qv_snapshot);
  });

  it('management insights cross-file reconciliation', () => {
    const sources = {
      cycleSummary: loadJson('cycle_summary.json'),
      pairedCycles: loadJson('paired_cycles.json'),
      changeDrivers: loadJson('nps_change_drivers.json'),
      financialProfile: loadJson('nps_financial_profile.json'),
      responseTopics: loadJson('response_topics.json'),
      responses: loadJson('responses.json'),
    };
    const cross = crossCheckManagementSources(sources);
    assert.equal(cross.ok, true, cross.errors?.join('; '));
  });

  it('management insights artefato e quality gates', () => {
    let mgmt;
    try {
      mgmt = loadJson('nps_management_insights.json');
    } catch {
      const sources = {
        cycleSummary: loadJson('cycle_summary.json'),
        pairedCycles: loadJson('paired_cycles.json'),
        changeDrivers: loadJson('nps_change_drivers.json'),
        financialProfile: loadJson('nps_financial_profile.json'),
        responseTopics: loadJson('response_topics.json'),
        responses: loadJson('responses.json'),
      };
      mgmt = buildManagementInsights(sources);
    }
    assert.ok(mgmt.insights.length >= 10);
    assert.equal(mgmt.executive_cards.length, 4);
    const f = mgmt.insights.find((i) => i.id === 'F_resultados_more_mechanisms');
    assert.equal(f.status, 'highlight');
    const changeDrivers = loadJson('nps_change_drivers.json');
    assert.equal(
      f.detail?.n_negative,
      changeDrivers.resultados_mechanisms?.resultados_negative?.n,
    );
    const k = mgmt.insights.find((i) => i.id === 'K_aporte_distribution_context');
    assert.equal(k.status, 'context');
    assert.ok(!mgmt.executive_cards.some((c) => c.insight_id === 'K_aporte_distribution_context'));
  });

  it('QA financeiro reconcilia MCP vs pipeline', () => {
    let qa;
    try {
      qa = loadQuality('nps_financial_profile_qa.json');
    } catch {
      return;
    }
    assert.ok(qa.coverage_reconciliation?.mcp_audit?.with_row === 243);
    assert.equal(qa.coverage_reconciliation?.pipeline_set?.financial_rows, 253);
  });
});
