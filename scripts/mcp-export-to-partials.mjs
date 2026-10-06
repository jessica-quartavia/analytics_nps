#!/usr/bin/env node
/**
 * Converte saídas de user-supabase execute_sql (json_agg em coluna "data")
 * em data/ingest/partials/*.json
 *
 * Uso: node scripts/mcp-export-to-partials.mjs <tableKey> <mcp-output-file>
 * tableKey: nps_cycles | journey_stages | nps_sends | nps_sends_2 | clients |
 *           nps_responses | client_journeys | engenheiro_transfer_logs | engenheiros_patrimoniais
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRows } from './ingest-mcp-sql-export.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const partialsDir = join(__dirname, '../data/ingest/partials');

const [tableKey, mcpPath] = process.argv.slice(2);
if (!tableKey || !mcpPath) {
  console.error('Uso: mcp-export-to-partials.mjs <tableKey> <mcp-output-file>');
  process.exit(1);
}

const text = readFileSync(mcpPath, 'utf8');
let rows = extractRows(text);
if (!rows) {
  console.error('Não foi possível extrair JSON do arquivo MCP');
  process.exit(1);
}

/** @type {unknown} */
let data = rows;
if (rows.length === 1 && rows[0] && typeof rows[0] === 'object' && 'data' in rows[0]) {
  data = rows[0].data;
}
if (!Array.isArray(data)) {
  console.error('Payload não é array após unwrap de .data');
  process.exit(1);
}

mkdirSync(partialsDir, { recursive: true });

const OUT = {
  nps_cycles: 'nps_cycles.json',
  journey_stages: 'journey_stages.json',
  nps_sends: 'nps_sends.json',
  nps_sends_2: 'nps_sends_2_append.json',
  clients: 'clients.json',
  clients_2: 'clients_2_append.json',
  nps_responses: 'nps_responses_full.json',
  client_journeys: 'client_journeys.json',
  engenheiro_transfer_logs: 'engenheiro_transfer_logs.json',
  engenheiros_patrimoniais: 'engenheiros_patrimoniais.json',
};

const outName = OUT[tableKey];
if (!outName) {
  console.error('tableKey desconhecido:', tableKey);
  process.exit(1);
}

if (tableKey === 'clients_2') {
  const existing = JSON.parse(readFileSync(join(partialsDir, 'clients.json'), 'utf8'));
  const merged = [...existing, ...data];
  writeFileSync(join(partialsDir, 'clients.json'), `${JSON.stringify(merged)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, merged: merged.length }, null, 2));
  process.exit(0);
}

if (tableKey === 'nps_sends_2') {
  const existing = JSON.parse(readFileSync(join(partialsDir, 'nps_sends.json'), 'utf8'));
  const merged = [...existing, ...data];
  writeFileSync(join(partialsDir, 'nps_sends.json'), `${JSON.stringify(merged)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, merged: merged.length }, null, 2));
  process.exit(0);
}

if (tableKey === 'nps_responses') {
  const mid = Math.ceil(data.length / 2);
  writeFileSync(join(partialsDir, 'nps_responses_1.json'), `${JSON.stringify(data.slice(0, mid))}\n`, 'utf8');
  writeFileSync(join(partialsDir, 'nps_responses_2.json'), `${JSON.stringify(data.slice(mid))}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, total: data.length, part1: mid, part2: data.length - mid }, null, 2));
  process.exit(0);
}

writeFileSync(join(partialsDir, outName), `${JSON.stringify(data)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, file: outName, rows: data.length }, null, 2));
