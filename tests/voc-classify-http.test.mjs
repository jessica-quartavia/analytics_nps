import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVocClassifyHealthPayload,
  executeVocClassifyHttpRequest,
} from '../lib/persistence/voc-classify-http.mjs';
import { verifyVocClassifierBearer } from '../lib/persistence/voc-api-auth.mjs';

describe('voc-classify-http', () => {
  it('401 sem Bearer', async () => {
    process.env.ANALYTICS_NPS_VOC_CLASSIFY_TOKEN = 'secret';
    const out = await executeVocClassifyHttpRequest({
      method: 'POST',
      authorization: 'Bearer wrong',
      body: { answer: 'x', candidate_themes: ['Clareza / comunicação'] },
    });
    assert.equal(out.status, 401);
  });

  it('405 GET', async () => {
    process.env.ANALYTICS_NPS_VOC_CLASSIFY_TOKEN = 't';
    const out = await executeVocClassifyHttpRequest({ method: 'GET', authorization: 'Bearer t' });
    assert.equal(out.status, 405);
  });

  it('health shape', () => {
    const p = buildVocClassifyHealthPayload({
      VOC_AI_MODEL: 'gemini-3.6-flash',
      VOC_AI_PROVIDER: 'gemini',
    });
    assert.equal(p.service, 'analytics-nps-voc-classifier');
    assert.equal(p.ok, true);
  });

  it('sync token alias', () => {
    process.env.ANALYTICS_NPS_VOC_SYNC_TOKEN = 'alias-token';
    delete process.env.ANALYTICS_NPS_VOC_CLASSIFY_TOKEN;
    assert.equal(verifyVocClassifierBearer('Bearer alias-token').ok, true);
  });
});
