import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnlySql, guardQueryBuilder } from '../lib/data/read-only-guard.mjs';

describe('read-only guard', () => {
  it('bloqueia SQL de escrita', () => {
    assert.throws(() => assertReadOnlySql('INSERT INTO x VALUES (1)'));
    assert.throws(() => assertReadOnlySql('SELECT 1; DROP TABLE x'));
  });

  it('bloqueia .insert no query builder', () => {
    const fake = {
      select: () => fake,
      insert: () => {},
    };
    const guarded = guardQueryBuilder(fake);
    assert.throws(() => guarded.insert({}));
  });
});
