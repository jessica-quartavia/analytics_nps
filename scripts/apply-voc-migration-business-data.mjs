/**
 * Aplica migration VoC no Business Data (rckp…) via Supabase MCP/CLI.
 * Bloqueia se detectar BASE QV (lacinx…).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUSINESS_DATA_PROJECT_REF } from '../lib/persistence/voc-supabase-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = join(root, 'supabase/migrations/20261001170000_create_analytics_nps_voc_automation.sql');
const sql = readFileSync(sqlPath, 'utf8');

console.log('Migration:', sqlPath);
console.log('Target project_ref:', BUSINESS_DATA_PROJECT_REF);
console.log('');
console.log('Antes de aplicar: confirme que o MCP Supabase ativo aponta para rckpuebaiswrxzmywllv');
console.log('(get_project_url NÃO deve retornar lacinxsvjdwalkchxyeo).');
console.log('');
console.log('Com MCP correto, use: apply_migration name=create_analytics_nps_voc_automation');
console.log('Ou Supabase Dashboard → SQL → colar o arquivo de migration.');
console.log('');
console.log('SQL length:', sql.length, 'chars');
