import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeVocManualReviewHttpRequest } from '../lib/persistence/voc-manual-review-http.mjs';
import { isLocalDevReviewBypass } from '../lib/auth/dashboard-session-audit.mjs';

test('local dev bypass when auth not required', () => {
  assert.equal(isLocalDevReviewBypass({ DASHBOARD_AUTH_REQUIRED: '0', NODE_ENV: 'development' }), true);
  assert.equal(isLocalDevReviewBypass({ DASHBOARD_AUTH_REQUIRED: '1', VERCEL_ENV: 'production' }), false);
});

test('POST review without bearer allowed in local dev bypass', async () => {
  const out = await executeVocManualReviewHttpRequest({
    method: 'POST',
    authorization: undefined,
    body: {
      response_id: 'test-id',
      reviewed_topics: [{ topic: 'Expectativa', valence: 'Negativa' }],
      _dashboard_reviewer_email: 'dev@local',
    },
    env: { DASHBOARD_AUTH_REQUIRED: '0', NODE_ENV: 'development' },
  });
  assert.notEqual(out.status, 401, 'should not reject with Unauthorized in local dev');
});
