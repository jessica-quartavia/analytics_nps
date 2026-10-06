/**
 * Executa chunk_*.sql via Supabase SQL (requer ANALYTICS_NPS_DATABASE_URL no .env).
 * Fallback: imprime instrução para aplicar chunks via MCP execute_sql.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');

function loadEnv() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
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
  const url = env.ANALYTICS_NPS_DATABASE_URL ?? env.BUSINESS_DATA_DATABASE_URL;
  if (!url?.includes('rckpuebaiswrxzmywllv')) {
    console.error('ANALYTICS_NPS_DATABASE_URL ausente — aplique scripts/out/chunk_*.sql via MCP execute_sql.');
    process.exit(2);
  }
  const sql = postgres(url, { max: 1 });
  const chunks = readdirSync(outDir)
    .filter((f) => /^chunk_\d+\.sql$/.test(f))
    .sort();
  for (const file of chunks) {
    const body = readFileSync(join(outDir, file), 'utf8');
    console.error('running', file, body.length, 'chars');
    await sql.unsafe(body);
  }
  await sql.end();
  console.log(JSON.stringify({ ok: true, chunks: chunks.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
