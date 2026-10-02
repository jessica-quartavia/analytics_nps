import { BUSINESS_DATA_PROJECT_REF, loadBusinessDataSupabaseConfig, assertBusinessDataProject } from './voc-supabase-config.mjs';

/** @param {NodeJS.ProcessEnv} [env] */
export function loadVocDbMode(env = process.env) {
  const raw = String(env.ANALYTICS_NPS_DB_MODE ?? 'postgres').trim().toLowerCase();
  if (raw === 'postgrest' || raw === 'postgres') return raw;
  return 'postgres';
}

/** @param {NodeJS.ProcessEnv} [env] */
export function loadPostgresDatabaseConfig(env = process.env) {
  const databaseUrl = String(env.ANALYTICS_NPS_DATABASE_URL ?? env.BUSINESS_DATA_DATABASE_URL ?? '').trim();
  return {
    databaseUrl,
    configured: Boolean(databaseUrl),
    projectRef: BUSINESS_DATA_PROJECT_REF,
  };
}

export function assertPostgresBusinessData(config) {
  if (!config.configured) {
    throw new Error('ANALYTICS_NPS_DATABASE_URL é obrigatório quando ANALYTICS_NPS_DB_MODE=postgres');
  }
  const u = config.databaseUrl.toLowerCase();
  if (u.includes('lacinxsvjdwalkchxyeo')) {
    throw new Error('Refusing Postgres URL pointing to BASE QV (lacinx…). Use Business Data rckp…');
  }
  if (!u.includes(BUSINESS_DATA_PROJECT_REF)) {
    throw new Error(`ANALYTICS_NPS_DATABASE_URL deve referenciar o projeto ${BUSINESS_DATA_PROJECT_REF}`);
  }
}

/** host + database name only (no password). */
export function safePostgresLogInfo(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'http:'));
    const host = parsed.hostname || 'unknown';
    const database = (parsed.pathname || '/postgres').replace(/^\//, '') || 'postgres';
    return { host, database };
  } catch {
    return { host: 'unknown', database: 'unknown' };
  }
}

export function assertStoreEnvConfigured(mode, env = process.env) {
  if (mode === 'postgres') {
    assertPostgresBusinessData(loadPostgresDatabaseConfig(env));
    return;
  }
  const cfg = loadBusinessDataSupabaseConfig(env);
  assertBusinessDataProject(cfg);
}
