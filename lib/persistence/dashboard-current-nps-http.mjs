import { serializeError } from './voc-supabase-errors.mjs';
import { getBaseQvEnvStatus, logDashboardRuntime } from './dashboard-base-qv-env.mjs';
import { runRuntimeCurrentNpsRefresh } from '../pipeline/runtime-current-nps.mjs';

export async function handleDashboardCurrentNpsVercel(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: { message: 'Method not allowed' } }));
    return;
  }

  const env = getBaseQvEnvStatus();
  logDashboardRuntime('current-nps', { ready: env.ready });
  if (!env.ready) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        code: env.serviceRoleConfigured && env.role === 'anon' ? 'BASE_QV_INVALID_KEY' : 'BASE_QV_UNAVAILABLE',
        message: 'BASE QV indisponível para refresh leve.',
        base_qv: {
          url_configured: env.urlConfigured,
          service_role_key_configured: env.serviceRoleConfigured,
          service_role_key_role: env.role,
        },
      }),
    );
    return;
  }

  try {
    const payload = await runRuntimeCurrentNpsRefresh();
    logDashboardRuntime('current-nps_ok', {
      validResponses: payload?.executive_current_kpis?.valid_responses ?? null,
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('[dashboard-current-nps]', serializeError(err));
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        code: 'CURRENT_NPS_FAILED',
        message: err.message ?? 'Falha no refresh leve NPS',
      }),
    );
  }
}
