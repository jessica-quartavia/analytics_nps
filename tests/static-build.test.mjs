import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatic, auditDistSecurity } from '../scripts/build-static.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

describe('build estático Vercel', () => {
  it('gera dist com index, css, js e datasets', () => {
    buildStatic();
    assert.ok(existsSync(join(dist, 'index.html')), 'dist/index.html');
    assert.ok(existsSync(join(dist, 'css')), 'dist/css');
    assert.ok(existsSync(join(dist, 'js')), 'dist/js');
    assert.ok(
      existsSync(join(dist, 'data/processed/cycle_summary.json')),
      'dist/data/processed/cycle_summary.json',
    );
    assert.ok(
      existsSync(join(dist, 'data/snapshots/latest.json')),
      'dist/data/snapshots/latest.json',
    );
  });

  it('não publica .env, raw ou imports em dist', () => {
    buildStatic();
    assert.equal(existsSync(join(dist, '.env')), false);
    assert.equal(existsSync(join(dist, 'data/raw')), false);
    assert.equal(existsSync(join(dist, 'data/imports')), false);
    const errors = auditDistSecurity(dist);
    assert.equal(errors.length, 0, errors.join('; '));
  });

  it('index.html referencia assets na raiz', () => {
    buildStatic();
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    assert.match(html, /href="\/css\//);
    assert.match(html, /src="\/js\/app\.js"/);
    assert.doesNotMatch(html, /\/dashboard\//);
  });
});
