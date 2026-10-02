import { timingSafeEqual } from 'node:crypto';

/**
 * @param {string | undefined} authorizationHeader
 * @param {NodeJS.ProcessEnv} [env]
 */
export function verifyVocSyncBearer(authorizationHeader, env = process.env) {
  const expected = String(env.ANALYTICS_NPS_VOC_SYNC_TOKEN ?? '').trim();
  if (!expected) {
    return { ok: false, code: 'SYNC_TOKEN_NOT_CONFIGURED' };
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
