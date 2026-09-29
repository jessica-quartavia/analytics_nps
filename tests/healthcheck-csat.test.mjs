import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveCurrentCycleCode,
  findCsatSummaryForCycle,
  formatCsatResponsesMetric,
  formatHealthcheckReport,
  runHealthcheck,
} from '../lib/ops/healthcheck-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SET_CODE = 'NPS-2026-SET-PHARUS';

describe('healthcheck CSAT presentation', () => {
  it('resolveCurrentCycleCode prioriza latest.cycle_code', () => {
    const code = resolveCurrentCycleCode({
      latest: { cycle_code: SET_CODE },
      paired: { current_cycle: 'OTHER' },
      diagnosis: { cycle_code: 'OTHER2' },
      cycleSummary: { cycles: [{ cycle_code: 'OTHER3' }] },
    });
    assert.equal(code, SET_CODE);
  });

  it('current cycle com CSAT — valid_responses no relatório', () => {
    const csatDoc = {
      cycles: [{ analytical_cycle_code: SET_CODE, valid_responses: 83 }],
    };
    const entry = findCsatSummaryForCycle(csatDoc, SET_CODE);
    assert.equal(entry.valid_responses, 83);
    assert.equal(formatCsatResponsesMetric(entry.valid_responses), '83');

    const report = formatHealthcheckReport({
      ok: true,
      errors: [],
      warnings: [],
      metrics: {
        cycle_name: 'Set/2026',
        cycle_code: SET_CODE,
        nps: 56.1,
        valid_responses: 253,
        paired_clients: 81,
        voc_coverage_pct: 96.3,
        csat_valid_responses: 83,
        driver_tests: 48,
        action_queue_total: 98,
        cross_page_consistency: 'PASS',
        last_refresh: 'SUCCESS',
      },
    });
    assert.match(report, /CSAT responses: 83/);
  });

  it('current cycle sem CSAT — N/A no relatório', () => {
    const csatDoc = {
      cycles: [{ analytical_cycle_code: 'NPS-2026-JUN-JUL-PHARUS', valid_responses: 100 }],
    };
    assert.equal(findCsatSummaryForCycle(csatDoc, SET_CODE), null);
    assert.equal(formatCsatResponsesMetric(null), 'N/A');
    assert.equal(formatCsatResponsesMetric(undefined), 'N/A');

    const report = formatHealthcheckReport({
      ok: true,
      errors: [],
      warnings: [],
      metrics: {
        cycle_code: SET_CODE,
        csat_valid_responses: null,
        cross_page_consistency: 'PASS',
        last_refresh: 'SUCCESS',
      },
    });
    assert.match(report, /CSAT responses: N\/A/);
    assert.doesNotMatch(report, /CSAT responses: —/);
  });

  it('integração: latest + csat_summary alinhados quando ciclo tem entrada', () => {
    const latestPath = join(root, 'data/snapshots/latest.json');
    const csatPath = join(root, 'data/processed/csat_summary.json');
    if (!existsSync(latestPath) || !existsSync(csatPath)) return;

    const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
    const csatSummary = JSON.parse(readFileSync(csatPath, 'utf8'));
    const cycleCode = latest.cycle_code ?? latest.cycleCode;
    if (!cycleCode) return;

    const entry = findCsatSummaryForCycle(csatSummary, cycleCode);
    const result = runHealthcheck();
    if (entry?.valid_responses != null) {
      assert.equal(
        result.metrics.csat_valid_responses,
        entry.valid_responses,
        'healthcheck deve espelhar valid_responses do csat_summary',
      );
      assert.match(formatHealthcheckReport(result), new RegExp(`CSAT responses: ${entry.valid_responses}`));
    }
  });
});
