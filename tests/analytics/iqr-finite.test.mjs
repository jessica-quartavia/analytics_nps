import test from 'node:test';
import assert from 'node:assert/strict';
import { iqr } from '../../lib/analytics/milestone-temporal.mjs';

test('iqr never returns NaN and marks small samples', () => {
  const small = iqr([1, 2, 3]);
  assert.equal(small.iqr, null);
  assert.equal(small.insufficient, true);
  const ok = iqr([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(Number.isFinite(ok.iqr));
  const filtered = iqr([1, NaN, Infinity, null, 4, 5, 6, 7]);
  assert.ok(Number.isFinite(filtered.iqr));
});
