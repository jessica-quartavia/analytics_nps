#!/usr/bin/env node
/**
 * Gera data/config/dashboard-auth.json (anon key only) para o frontend.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-dotenv.mjs';
import { ALLOWED_QUARTAVIA_DOMAIN, parseAllowedEmailDomains } from '../lib/auth/quartavia-user.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const url =
  String(process.env.DASHBOARD_AUTH_SUPABASE_URL ?? process.env.ANALYTICS_NPS_SUPABASE_URL ?? '').trim();
const anonKey = String(
  process.env.DASHBOARD_AUTH_SUPABASE_ANON_KEY ?? process.env.ANALYTICS_NPS_SUPABASE_ANON_KEY ?? '',
).trim();

const authRequired =
  process.env.DASHBOARD_AUTH_REQUIRED !== '0' && process.env.DASHBOARD_AUTH_REQUIRED !== 'false';

const payload = {
  supabaseUrl: url || null,
  anonKey: anonKey || null,
  authRequired: Boolean(url && anonKey && authRequired),
  allowedDomain: ALLOWED_QUARTAVIA_DOMAIN,
  allowedDomains: parseAllowedEmailDomains(),
};

const outDir = join(root, 'data/config');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'dashboard-auth.json');
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, path: outPath, authRequired: payload.authRequired }, null, 2));
