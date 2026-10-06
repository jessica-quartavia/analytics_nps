/**
 * Aplica scripts/out/mcp/part_*.sql via RPC public.nps_historico_import_exec (service role).
 * Uso: node scripts/run-nps-historico-mcp-parts.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mcpDir = join(dirname(fileURLToPath(import.meta.url)), 'out', 'mcp');

function loadEnv() {
  const envPath = join(root, '.env');
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.ANALYTICS_NPS_SUPABASE_URL;
  const key = env.ANALYTICS_NPS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.includes('rckpuebaiswrxzmywllv') || !key) {
    throw new Error('Business Data Supabase env missing');
  }
  if (!existsSync(mcpDir)) throw new Error(`Missing ${mcpDir} — run import-nps-historico-pharus.py first`);

  const parts = readdirSync(mcpDir)
    .filter((f) => /^part_\d+\.sql$/.test(f))
    .sort();

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const file of parts) {
    const body = readFileSync(join(mcpDir, file), 'utf8');
    process.stderr.write(`exec ${file} (${body.length} chars)\n`);
    const { error } = await supabase.rpc('nps_historico_import_exec', { p_sql: body });
    if (error) throw new Error(`${file}: ${error.message}`);
  }

  console.log(JSON.stringify({ ok: true, parts: parts.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
