import { createBusinessDataAuthClient } from './quartavia-user.mjs';

export function isDashboardAuthRequired(env = process.env) {
  return env.DASHBOARD_AUTH_REQUIRED === '1' || env.DASHBOARD_AUTH_REQUIRED === 'true';
}

export function isProductionDeploy(env = process.env) {
  if (env.VERCEL_ENV === 'production') return true;
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') return false;
  return env.NODE_ENV === 'production';
}

/** Localhost / dev: dashboard já aberto sem auth global → revisão permitida. */
export function isLocalDevReviewBypass(env = process.env) {
  return !isDashboardAuthRequired(env) && !isProductionDeploy(env);
}

/**
 * Identifica revisor via JWT (sem segunda checagem de domínio).
 * Gate global do dashboard já autorizou o usuário.
 *
 * @param {string|undefined} authorizationHeader
 * @param {object} [devFallback] email/name do dashboard em modo dev
 */
export async function resolveReviewerIdentity(authorizationHeader, env = process.env, devFallback = {}) {
  const token = String(authorizationHeader ?? '').replace(/^Bearer\s+/i, '').trim();

  if (token) {
    const authClient = createBusinessDataAuthClient(env);
    if (!authClient) {
      if (isLocalDevReviewBypass(env)) {
        return devIdentity(devFallback, env);
      }
      return { ok: false, code: 'auth_client_not_configured' };
    }
    const { data, error } = await authClient.auth.getUser(token);
    if (!error && data?.user) {
      const email = data.user.email ?? devFallback.email ?? '';
      if (!email) return { ok: false, code: 'invalid_session' };
      return {
        ok: true,
        email,
        name:
          data.user.user_metadata?.full_name ??
          data.user.user_metadata?.name ??
          data.user.user_metadata?.display_name ??
          devFallback.name ??
          null,
        user_id: data.user.id ?? null,
      };
    }
    if (isLocalDevReviewBypass(env)) {
      return devIdentity(devFallback, env);
    }
    return { ok: false, code: 'invalid_session', detail: error?.message };
  }

  if (isLocalDevReviewBypass(env)) {
    return devIdentity(devFallback, env);
  }

  return { ok: false, code: 'missing_token' };
}

function devIdentity(devFallback, env) {
  const email =
    String(devFallback.email ?? '').trim() ||
    (isProductionDeploy(env) ? '' : 'local-dev@quartavia.com.br');
  if (!email) return { ok: false, code: 'missing_token' };
  return {
    ok: true,
    email,
    name: devFallback.name ?? 'Local dev',
    user_id: devFallback.user_id ?? null,
  };
}
