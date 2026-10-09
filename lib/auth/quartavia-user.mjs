/** Domínio corporativo Quartavia (validação exata após @). */
export const ALLOWED_QUARTAVIA_DOMAIN = 'quartavia.com.br';

/** @param {string|string[]|undefined} extraDomains env DASHBOARD_ALLOWED_EMAIL_DOMAINS=comma,separated */
export function parseAllowedEmailDomains(env = process.env) {
  const raw = String(env.DASHBOARD_ALLOWED_EMAIL_DOMAINS ?? '').trim();
  const extras = raw
    ? raw.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
    : [];
  return [ALLOWED_QUARTAVIA_DOMAIN, ...extras];
}

/**
 * @param {string|null|undefined} email
 * @param {{ allowedDomains?: string[] }} [opts]
 */
export function isAuthorizedQuartaviaUser(email, opts = {}) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0]) return false;
  const domain = parts[1];
  const allowed = opts.allowedDomains ?? [ALLOWED_QUARTAVIA_DOMAIN];
  return allowed.includes(domain);
}

import { createClient } from '@supabase/supabase-js';
import { loadBusinessDataSupabaseConfig } from '../persistence/voc-supabase-config.mjs';

/** Cliente Auth (anon) — validação de JWT de sessão do dashboard. */
export function createBusinessDataAuthClient(env = process.env) {
  const cfg = loadBusinessDataSupabaseConfig(env);
  if (!cfg.url || !cfg.anonKey) return null;
  return createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * @param {string|undefined} authorizationHeader Bearer token
 * @param {import('@supabase/supabase-js').SupabaseClient} [_supabaseAdmin] legado — preferir anon client
 */
export async function verifyQuartaviaBearerSession(authorizationHeader, _supabaseAdmin, opts = {}) {
  const token = String(authorizationHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, code: 'missing_token' };

  const authClient = createBusinessDataAuthClient(opts.env ?? process.env);
  const client = authClient ?? _supabaseAdmin;
  if (!client) return { ok: false, code: 'auth_client_not_configured' };

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { ok: false, code: 'invalid_session', detail: error?.message };

  const email = data.user.email ?? '';
  if (!isAuthorizedQuartaviaUser(email, opts)) {
    return { ok: false, code: 'unauthorized_domain', email };
  }

  return {
    ok: true,
    user: data.user,
    email,
    name:
      data.user.user_metadata?.full_name ??
      data.user.user_metadata?.name ??
      data.user.user_metadata?.display_name ??
      null,
  };
}
