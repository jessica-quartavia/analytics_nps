import { serializeError } from './voc-supabase-errors.mjs';
import { getBaseQvEnvStatus, logDashboardRuntime } from './dashboard-base-qv-env.mjs';
import {
  runRuntimeDashboardRefresh,
  RUNTIME_REFRESH_DATASETS,
} from '../pipeline/runtime-dashboard-refresh.mjs';

function parseForce(url) {
  try {
    const u = new URL(url, 'http://localhost');
    return u.searchParams.get('force') === '1' || u.searchParams.get('force') === 'true';
  } catch {
    return false;
  }
}

export async function handleDashboardRefreshVercel(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: { message: 'Method not allowed' } }));
    return;
  }

  const force = parseForce(req.url ?? '');

  const env = getBaseQvEnvStatus();
  logDashboardRuntime('refresh', { force, ready: env.ready });
  if (!env.urlConfigured || !env.serviceRoleConfigured) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        code: 'BASE_QV_UNAVAILABLE',
        message:
          'Refresh runtime indisponível: configure BASE_QV_SUPABASE_URL e BASE_QV_SUPABASE_SERVICE_ROLE_KEY no servidor.',
        base_qv: {
          url_configured: env.urlConfigured,
          service_role_key_configured: env.serviceRoleConfigured,
          service_role_key_role: env.role,
        },
        runtime_datasets: RUNTIME_REFRESH_DATASETS,
      }),
    );
    return;
  }
  if (!env.ready) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        code: 'BASE_QV_INVALID_KEY',
        message:
          'BASE_QV_SUPABASE_SERVICE_ROLE_KEY inválida (JWT anon). Use a service_role do projeto BASE QV em Settings → API.',
        base_qv: {
          url_configured: env.urlConfigured,
          service_role_key_configured: env.serviceRoleConfigured,
          service_role_key_role: env.role,
        },
        runtime_datasets: RUNTIME_REFRESH_DATASETS,
      }),
    );
    return;
  }

  try {
    const payload = await runRuntimeDashboardRefresh({ force });
    logDashboardRuntime('refresh_ok', {
      force,
      source: payload?.source ?? null,
      validResponses: payload?.executive_current_kpis?.valid_responses ?? null,
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('[dashboard-refresh]', serializeError(err));
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        code: 'REFRESH_FAILED',
        message: err.message ?? 'Falha ao recalcular dados a partir da BASE QV',
        details: err.details ?? null,
      }),
    );
  }
}
