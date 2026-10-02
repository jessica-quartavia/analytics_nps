import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyVocSyncBearer } from '../lib/persistence/voc-sync-auth.mjs';
import { executeVocSyncHttpRequest } from '../lib/persistence/voc-sync-http.mjs';

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
});
