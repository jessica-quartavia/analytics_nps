import { detectSupabaseKeyRole } from '../data/base-qv.mjs';

/** Status do servidor para refresh runtime (sem secrets). */
export function getDashboardServerConfig() {
  const urlConfigured = Boolean(process.env.BASE_QV_SUPABASE_URL);
  const key = process.env.BASE_QV_SUPABASE_SERVICE_ROLE_KEY ?? '';
  const keyConfigured = Boolean(key);
  const keyRole = detectSupabaseKeyRole(key);
  const baseQvReady = urlConfigured && keyConfigured && keyRole === 'service_role';

  return {
    ok: true,
    base_qv: {
      url_configured: urlConfigured,
      service_role_key_configured: keyConfigured,
      service_role_key_role: keyRole,
      ready: baseQvReady,
    },
    require_runtime_refresh: process.env.DASHBOARD_REQUIRE_RUNTIME_REFRESH === '1',
    env_expected: ['BASE_QV_SUPABASE_URL', 'BASE_QV_SUPABASE_SERVICE_ROLE_KEY'],
  };
}

export async function handleDashboardConfigVercel(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: { message: 'Method not allowed' } }));
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(getDashboardServerConfig()));
}
