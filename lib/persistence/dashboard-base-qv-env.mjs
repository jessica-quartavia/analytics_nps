import { detectSupabaseKeyRole } from '../data/base-qv.mjs';

/** Status BASE QV no servidor (sem secrets). */
export function getBaseQvEnvStatus() {
  const urlConfigured = Boolean(process.env.BASE_QV_SUPABASE_URL);
  const key = process.env.BASE_QV_SUPABASE_SERVICE_ROLE_KEY ?? '';
  const keyConfigured = Boolean(key);
  const keyRole = detectSupabaseKeyRole(key);
  const ready = urlConfigured && keyConfigured && keyRole === 'service_role';
  return {
    urlConfigured,
    serviceRoleConfigured: keyConfigured,
    role: keyRole,
    ready,
  };
}

/** Log seguro para Vercel — nunca imprime URL completa nem chave. */
export function logDashboardRuntime(source, extra = {}) {
  const env = getBaseQvEnvStatus();
  console.info(
    '[dashboard-runtime]',
    JSON.stringify({
      source,
      urlConfigured: env.urlConfigured,
      serviceRoleConfigured: env.serviceRoleConfigured,
      role: env.role,
      ready: env.ready,
      ...extra,
    }),
  );
}
