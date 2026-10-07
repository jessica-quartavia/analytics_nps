import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateNpsFromResponses } from '../lib/analytics/nps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const auditPath = join(ROOT, 'data/quality/nps_calculation_audit.json');

describe('nps calculation audit artifact', () => {
  it('audit file exists and matches live kernel on default cycle', () => {
    if (!existsSync(auditPath)) {
      assert.fail('Execute: node scripts/nps-calculation-audit.mjs');
    }
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    const responses = JSON.parse(
      readFileSync(join(ROOT, 'data/processed/responses.json'), 'utf8'),
    );
    const code = audit.default_current.cycle_code;
    const live = aggregateNpsFromResponses(
      responses.filter((r) => r.analytical_cycle_code === code),
    );
    assert.equal(audit.default_current.responses, live.responses);
    assert.equal(audit.default_current.promoters, live.promoters);
    assert.equal(audit.default_current.neutrals, live.neutrals);
    assert.equal(audit.default_current.detractors, live.detractors);
    assert.ok(Math.abs((audit.default_current.nps ?? 0) - (live.nps ?? 0)) < 1e-9);
  });

  it('documenta divergência vs referência 58,4 quando aplicável', () => {
    if (!existsSync(auditPath)) return;
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    assert.ok(audit.cause_analysis?.dashboard_61_5_explanation);
    if (!audit.default_current.user_reference_matched) {
      assert.equal(audit.default_current.user_reference_matched, false);
    }
  });
});
