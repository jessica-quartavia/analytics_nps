import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyVocSyncBearer } from '../lib/persistence/voc-sync-auth.mjs';
import { executeVocSyncHttpRequest } from '../lib/persistence/voc-sync-http.mjs';
import { buildVocSyncHealthPayload } from '../lib/persistence/voc-sync-health.mjs';
import { resolveSourceFetchSince } from '../lib/persistence/voc-source-base-qv.mjs';

describe('voc-sync-http', () => {
  it('401 sem Bearer', async () => {
    const env = { ANALYTICS_NPS_VOC_SYNC_TOKEN: 'secret-token' };
    assert.equal(verifyVocSyncBearer(undefined, env).ok, false);
    process.env.ANALYTICS_NPS_VOC_SYNC_TOKEN = 'secret-token';
    const out = await executeVocSyncHttpRequest({
      method: 'POST',
      authorization: 'Bearer wrong',
      body: { dryRun: true },
    });
    assert.equal(out.status, 401);
  });

  it('405 for GET', async () => {
    process.env.ANALYTICS_NPS_VOC_SYNC_TOKEN = 't';
    const out = await executeVocSyncHttpRequest({ method: 'GET', authorization: 'Bearer t' });
    assert.equal(out.status, 405);
  });

  it('health payload shape', () => {
    const p = buildVocSyncHealthPayload({
      VOC_SOURCE_MODE: 'base_qv',
      ANALYTICS_NPS_DB_MODE: 'postgres',
      VOC_AI_PROVIDER: 'gemini',
      VOC_USE_GEMINI: '1',
      GEMINI_API_KEY: 'x',
      VOC_AI_MODEL: 'gemini-3.6-flash',
    });
    assert.equal(p.service, 'analytics-nps-voc-sync');
    assert.equal(p.source_mode, 'base_qv');
    assert.equal(p.ok, true);
  });

  it('watermark lookback subtracts hours', () => {
    const since = resolveSourceFetchSince('2026-01-10T12:00:00.000Z', { VOC_SOURCE_LOOKBACK_HOURS: '24' });
    assert.equal(since, '2026-01-09T12:00:00.000Z');
  });
});
