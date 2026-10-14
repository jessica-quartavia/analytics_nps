import { getBaseQvEnvStatus, logDashboardRuntime } from './dashboard-base-qv-env.mjs';

/** Status do servidor para refresh runtime (sem secrets). */
export function getDashboardServerConfig() {
  const env = getBaseQvEnvStatus();
  return {
    ok: true,
    base_qv: {
      url_configured: env.urlConfigured,
      service_role_key_configured: env.serviceRoleConfigured,
      service_role_key_role: env.role,
      ready: env.ready,
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
  logDashboardRuntime('config');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(getDashboardServerConfig()));
}
