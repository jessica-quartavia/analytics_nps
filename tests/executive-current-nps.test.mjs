import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildExecutiveCurrentNpsSummary,
  computeExecutiveCurrentNpsAggregate,
  computeCycleOnlyAggregate,
} from '../lib/analytics/executive-current-nps.mjs';
import { formatNps } from '../dashboard/js/utils/format.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SET = 'NPS-2026-SET-PHARUS';

describe('executive current NPS (card Executivo)', () => {
  it('default current — kernel PHARUS dedupe (não cycle_summary SET)', () => {
    const responses = JSON.parse(
      readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'),
    );
    const template = JSON.parse(
      readFileSync(join(ROOT, 'data/processed/cycle_summary.json'), 'utf8'),
    ).cycles.find((c) => c.cycle_code === SET);

    const cycleOnly = computeCycleOnlyAggregate(responses, SET);
    const global = computeExecutiveCurrentNpsAggregate(responses);
    const summary = buildExecutiveCurrentNpsSummary(responses, template);

    assert.equal(cycleOnly.responses, 283);
    assert.ok(Math.abs(cycleOnly.nps - 61.48409893992933) < 1e-9);

    assert.equal(global.responses, 443);
    assert.equal(global.promoters, 313);
    assert.equal(global.neutrals, 77);
    assert.equal(global.detractors, 53);
    assert.ok(Math.abs(global.nps - 58.69074492099323) < 1e-9);

    assert.equal(summary.nps, global.nps);
    assert.equal(summary.valid_responses, global.responses);
    assert.equal(summary.promoters, global.promoters);
    assert.equal(summary.passives, global.neutrals);
    assert.equal(summary.detractors, global.detractors);
    assert.equal(summary.nps_ci_low, null);

    const display = formatNps(global.nps);
    assert.equal(display, '58,7');
    assert.notEqual(formatNps(cycleOnly.nps), display);
  });

  it('executive_diagnosis overall alinhado ao kernel oficial (quando artefato existe)', () => {
    const diagnosisPath = join(ROOT, 'data/processed/executive_diagnosis.json');
    let diagnosis;
    try {
      diagnosis = JSON.parse(readFileSync(diagnosisPath, 'utf8'));
    } catch {
      return;
    }
    const responses = JSON.parse(
      readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'),
    );
    const global = computeExecutiveCurrentNpsAggregate(responses);
    const overall = diagnosis?.overall ?? {};
    assert.equal(overall.valid_responses, global.responses);
    assert.equal(overall.current_nps, global.nps);
    assert.equal(overall.promoters, global.promoters);
    assert.equal(overall.passives, global.neutrals);
    assert.equal(overall.detractors, global.detractors);
  });
});
