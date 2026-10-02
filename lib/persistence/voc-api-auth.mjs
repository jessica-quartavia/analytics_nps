import { timingSafeEqual } from 'node:crypto';

function expectedClassifierToken(env) {
  return String(
    env.ANALYTICS_NPS_VOC_CLASSIFY_TOKEN ?? env.ANALYTICS_NPS_VOC_SYNC_TOKEN ?? '',
  ).trim();
}

/**
 * Bearer auth for /api/voc-classify and /api/voc-prepare (n8n → Vercel).
 * @param {string | undefined} authorizationHeader
 * @param {NodeJS.ProcessEnv} [env]
 */
export function verifyVocClassifierBearer(authorizationHeader, env = process.env) {
  const expected = expectedClassifierToken(env);
  if (!expected) {
    return { ok: false, code: 'CLASSIFIER_TOKEN_NOT_CONFIGURED' };
  }
  const header = String(authorizationHeader ?? '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return { ok: false, code: 'MISSING_BEARER' };
  }
  const provided = match[1].trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: 'INVALID_TOKEN' };
  }
  return { ok: true };
}

/** @deprecated use verifyVocClassifierBearer — sync token alias */
export function verifyVocSyncBearer(authorizationHeader, env = process.env) {
  return verifyVocClassifierBearer(authorizationHeader, env);
}
