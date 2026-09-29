import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHealthcheck } from '../lib/ops/healthcheck-core.mjs';
import { loadMethodologyConfig } from '../lib/ops/methodology.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('ETAPA 3.9 — operação e produção', () => {
  it('methodology.json existe e tem versões', () => {
    const m = loadMethodologyConfig();
    assert.equal(m.nps_method_version, '1.0');
    assert.ok(m.voc_classifier_version);
    assert.ok(m.action_priority_version);
  });

  it('healthcheck passa com artefatos atuais', () => {
    const result = runHealthcheck();
    if (!existsSync(join(root, 'data/snapshots/latest.json'))) {
      assert.ok(result.errors.some((e) => e.code === 'no_latest' || e.code === 'missing_file'));
      return;
    }
    const latest = JSON.parse(readFileSync(join(root, 'data/snapshots/latest.json'), 'utf8'));
    if (latest.status === 'success') {
      assert.equal(result.ok, true, result.errors.map((e) => e.message).join('; '));
    }
  });

  it('healthcheck detecta blocker quando latest não é success', () => {
    const result = runHealthcheck();
    const latestPath = join(root, 'data/snapshots/latest.json');
    if (!existsSync(latestPath)) return;
    const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
    if (latest.status !== 'success') {
      assert.ok(result.errors.some((e) => e.code === 'refresh_not_success'));
    }
  });

  it('snapshot success inclui campos operacionais quando presentes', () => {
    const p = join(root, 'data/snapshots/latest.json');
    if (!existsSync(p)) return;
    const latest = JSON.parse(readFileSync(p, 'utf8'));
    if (latest.status !== 'success') return;
    assert.ok(latest.refresh_id || latest.refresh_run_id);
    assert.ok(latest.status);
  });

  it('refresh pipeline não referencia escrita em action_tracking', () => {
    const src = readFileSync(join(root, 'lib/pipeline/build-analytics.mjs'), 'utf8');
    assert.ok(!/writeJson\([^)]*action_tracking/.test(src));
    assert.ok(!/writeTable\([^)]*action_tracking/.test(src));
  });

  it('dashboard não expõe secrets Supabase', () => {
    const dash = join(root, 'dashboard');
    const files = [];
    function walk(dir) {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) walk(p);
        else if (/\.(js|html|css)$/.test(name.name)) files.push(p);
      }
    }
    walk(dash);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      assert.ok(!/service_role|SUPABASE_SERVICE|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(text), f);
    }
  });
});
