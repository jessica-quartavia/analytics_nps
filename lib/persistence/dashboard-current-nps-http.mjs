import { serializeError } from './voc-supabase-errors.mjs';
import { detectSupabaseKeyRole } from '../data/base-qv.mjs';
import { runRuntimeCurrentNpsRefresh } from '../pipeline/runtime-current-nps.mjs';

function baseQvEnvStatus() {
  const urlConfigured = Boolean(process.env.BASE_QV_SUPABASE_URL);
  const key = process.env.BASE_QV_SUPABASE_SERVICE_ROLE_KEY ?? '';
  const keyConfigured = Boolean(key);
  const keyRole = detectSupabaseKeyRole(key);
  const ready = urlConfigured && keyConfigured && keyRole === 'service_role';
  return { urlConfigured, keyConfigured, keyRole, ready };
}

export async function handleDashboardCurrentNpsVercel(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: { message: 'Method not allowed' } }));
    return;
  }

  const env = baseQvEnvStatus();
  if (!env.ready) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        code: env.keyConfigured && env.keyRole === 'anon' ? 'BASE_QV_INVALID_KEY' : 'BASE_QV_UNAVAILABLE',
        message: 'BASE QV indisponível para refresh leve.',
        base_qv: {
          url_configured: env.urlConfigured,
          service_role_key_configured: env.keyConfigured,
          service_role_key_role: env.keyRole,
        },
      }),
    );
    return;
  }

  try {
    const payload = await runRuntimeCurrentNpsRefresh();
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
