/**
 * Config Supabase App PHARUS (server-side only).
 * Nunca logar valores de chaves.
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

let loaded = false;

export function loadProjectDotenv() {
  if (loaded) return;
  dotenv.config({ path: join(projectRoot, '.env') });
  loaded = true;
}

/**
 * @returns {{ url: string, serviceRoleKey: string, configured: boolean }}
 */
export function getPharusSupabaseConfig(env = process.env) {
  const url = String(env.PHARUS_SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(env.PHARUS_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return {
    url,
    serviceRoleKey,
    configured: Boolean(url && serviceRoleKey),
  };
}

export function logPharusEnvStatus(env = process.env) {
  loadProjectDotenv();
  const cfg = getPharusSupabaseConfig(env);
  console.log(`PHARUS_SUPABASE_URL configured: ${Boolean(cfg.url)}`);
  console.log(`PHARUS_SUPABASE_SERVICE_ROLE_KEY configured: ${Boolean(cfg.serviceRoleKey)}`);
  return cfg;
}

export function pharusProjectRef(url) {
  try {
    const host = new URL(url).hostname;
    const ref = host.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}
