import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPharusSupabaseConfig, pharusProjectRef } from '../lib/pharus/env.mjs';

describe('pharus env helper', () => {
  it('prefere PHARUS_* e detecta configured', () => {
    const cfg = getPharusSupabaseConfig({
      PHARUS_SUPABASE_URL: 'https://abc.supabase.co',
      PHARUS_SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
    assert.equal(cfg.configured, true);
    assert.equal(pharusProjectRef(cfg.url), 'abc');
  });

  it('ignora aliases legados — só PHARUS_*', () => {
    const cfg = getPharusSupabaseConfig({
      APP_PHARUS_SUPABASE_URL: 'https://legacy.supabase.co',
      APP_PHARUS_SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    assert.equal(cfg.configured, false);
    assert.equal(cfg.url, '');
  });
});
