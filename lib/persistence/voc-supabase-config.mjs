/** Business Data — project_ref rckpuebaiswrxzmywllv (never BASE QV). */
export const BUSINESS_DATA_PROJECT_REF = 'rckpuebaiswrxzmywllv';

export function loadBusinessDataSupabaseConfig(env = process.env) {
  const url = String(env.ANALYTICS_NPS_SUPABASE_URL ?? env.BUSINESS_DATA_SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(
    env.ANALYTICS_NPS_SUPABASE_SERVICE_ROLE_KEY ?? env.BUSINESS_DATA_SUPABASE_SERVICE_ROLE_KEY ?? '',
  ).trim();
  return {
    url,
    serviceRoleKey,
    projectRef: BUSINESS_DATA_PROJECT_REF,
    configured: Boolean(url && serviceRoleKey),
  };
}

/** Abort if URL clearly points to BASE QV. */
export function assertBusinessDataProject(config) {
  if (!config.configured) {
    throw new Error('ANALYTICS_NPS_SUPABASE_URL e SERVICE_ROLE_KEY são obrigatórios (Business Data).');
  }
  if (config.url.includes('lacinxsvjdwalkchxyeo')) {
    throw new Error('Refusing to write VoC persistence to BASE QV (lacinxsvjdwalkchxyeo). Use Business Data rckp…');
  }
  if (!config.url.includes(BUSINESS_DATA_PROJECT_REF)) {
    throw new Error(
      `ANALYTICS_NPS_SUPABASE_URL deve ser o projeto ${BUSINESS_DATA_PROJECT_REF}, não outro ref.`,
    );
  }
}
