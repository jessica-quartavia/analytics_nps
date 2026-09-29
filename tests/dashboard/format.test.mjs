import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatNps, formatDeltaPts, formatNpsRange } from '../../dashboard/js/utils/format.js';

describe('formatNps (apresentação)', () => {
  it('uma casa decimal pt-BR', () => {
    assert.equal(formatNps(56.126), '56,1');
    assert.equal(formatNps(68.235294), '68,2');
    assert.equal(formatNps(-12.109), '-12,1');
  });

  it('null/NaN', () => {
    assert.equal(formatNps(null), '—');
    assert.equal(formatNps(undefined), '—');
  });

  it('formatDeltaPts', () => {
    assert.equal(formatDeltaPts(56.1, 68.2), '-12,1 pts');
  });

  it('formatNpsRange IC', () => {
    assert.equal(formatNpsRange(47.04, 64.82), '47,0 – 64,8');
  });
});
