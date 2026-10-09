import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { isAuthorizedQuartaviaUser, resolveOAuthRedirectTo } from './quartavia-access.mjs';

/** @type {{ supabaseUrl: string|null, anonKey: string|null, authRequired: boolean, allowedDomains: string[] }|null} */
let config = null;
/** @type {import('@supabase/supabase-js').SupabaseClient|null} */
let client = null;
/** @type {{ email: string, name: string|null, user: object }|null} */
let sessionUser = null;

const SESSION_CACHE_KEY = 'analytics_nps_auth_ok_v1';

export async function loadDashboardAuthConfig() {
  if (config) return config;
  try {
    const res = await fetch('/data/config/dashboard-auth.json', { cache: 'no-store' });
    if (!res.ok) {
      config = { supabaseUrl: null, anonKey: null, authRequired: false, allowedDomains: ['quartavia.com.br'] };
      return config;
    }
    const json = await res.json();
    config = {
      supabaseUrl: json.supabaseUrl ?? null,
      anonKey: json.anonKey ?? null,
      authRequired: Boolean(json.authRequired),
      allowedDomains: Array.isArray(json.allowedDomains) ? json.allowedDomains : ['quartavia.com.br'],
    };
  } catch {
    config = { supabaseUrl: null, anonKey: null, authRequired: false, allowedDomains: ['quartavia.com.br'] };
  }
  return config;
}

function getClient() {
  if (!config?.supabaseUrl || !config?.anonKey) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

export function getAuthSessionUser() {
  return sessionUser;
}

export async function getAccessToken() {
  const sb = getClient();
  if (!sb) return null;
  const { data: sessionData } = await sb.auth.getSession();
  let session = sessionData.session;
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data: refreshed } = await sb.auth.refreshSession();
    session = refreshed.session ?? session;
  }
  return session?.access_token ?? null;
}

export async function initDashboardAccess() {
  const cfg = await loadDashboardAuthConfig();
  if (!cfg.authRequired) {
    sessionUser = { email: 'dev@local', name: 'Dev (auth off)', user: null };
    return { status: 'authorized', user: sessionUser };
  }

  const sb = getClient();
  if (!sb) {
    return { status: 'misconfigured', message: 'Auth exigido, mas dashboard-auth.json incompleto.' };
  }

  const { data, error } = await sb.auth.getSession();
  if (error) console.warn('[auth] getSession', error.message);

  const user = data.session?.user ?? null;
  if (!user?.email) {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    return { status: 'login_required' };
  }

  if (!isAuthorizedQuartaviaUser(user.email, cfg.allowedDomains)) {
    await sb.auth.signOut();
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    return { status: 'denied_domain', email: user.email };
  }

  sessionUser = {
    email: user.email,
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    user,
  };
  sessionStorage.setItem(SESSION_CACHE_KEY, user.email);
  return { status: 'authorized', user: sessionUser };
}

export async function signInWithGoogle() {
  const sb = getClient();
  if (!sb) throw new Error('Auth não configurado');
  const redirectTo = resolveOAuthRedirectTo(window.location.origin);
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { hd: 'quartavia.com.br', prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export async function signOutDashboard() {
  const sb = getClient();
  sessionStorage.removeItem(SESSION_CACHE_KEY);
  sessionUser = null;
  if (sb) await sb.auth.signOut();
}

export function renderAccessGateHtml(state) {
  if (state.status === 'denied_domain') {
    return `
      <div class="access-gate access-gate--denied">
        <h1>Acesso restrito</h1>
        <p>Este painel é restrito a usuários autorizados da Quartavia.</p>
        <p class="note-muted">E-mail utilizado: ${state.email ?? '—'}</p>
        <button type="button" class="btn btn--primary" id="auth-sign-out">Sair e tentar outra conta</button>
      </div>`;
  }
  return `
    <div class="access-gate">
      <h1>Analytics NPS · QuartaVia</h1>
      <p>Entre com sua conta Google corporativa <strong>@quartavia.com.br</strong> para continuar.</p>
      <button type="button" class="btn btn--primary" id="auth-google-signin">Entrar com Google</button>
    </div>`;
}

export function bindAccessGateEvents(host, onAuthorized) {
  host.querySelector('#auth-google-signin')?.addEventListener('click', () => {
    signInWithGoogle().catch((e) => alert(e.message ?? String(e)));
  });
  host.querySelector('#auth-sign-out')?.addEventListener('click', async () => {
    await signOutDashboard();
    onAuthorized?.();
  });
}
