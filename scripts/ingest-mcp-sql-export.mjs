#!/usr/bin/env node
/** Extrai array JSON de arquivo de saída MCP execute_sql e grava no snapshot raw. */
import { readFileSync } from 'node:fs';
import { writeJson } from '../lib/data/file-store.mjs';

const [mcpOutputPath, snapshotId, destFile] = process.argv.slice(2);
if (!mcpOutputPath || !snapshotId || !destFile) {
  console.error('Uso: ingest-mcp-sql-export.mjs <mcp.txt> <snapshotId> <dest.json>');
  process.exit(1);
}

const text = readFileSync(mcpOutputPath, 'utf8');

export function extractRows(raw) {
  let payload = raw;
  try {
    const outer = JSON.parse(raw);
    if (typeof outer?.result === 'string') payload = outer.result;
  } catch {
    /* raw text */
  }
  const start = payload.indexOf('[{"');
  if (start < 0) {
    const alt = payload.indexOf('[{');
    if (alt < 0) return null;
    const end = payload.lastIndexOf('}]');
    if (end < alt) return null;
    return JSON.parse(payload.slice(alt, end + 2));
  }
  const end = payload.lastIndexOf('}]');
  if (end < start) return null;
  let rows = JSON.parse(payload.slice(start, end + 2));
  if (rows.length === 1 && rows[0].j) rows = rows[0].j;
  if (rows.length === 1 && rows[0].b64) {
    const b64 = String(rows[0].b64).replace(/\s/g, '');
    rows = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  }
  return rows;
}

const rows = extractRows(text);
if (!rows || !Array.isArray(rows)) {
  console.error('JSON array não encontrado no arquivo MCP');
  process.exit(1);
}
await writeJson(`raw/${snapshotId}/${destFile}`, rows);
console.log(JSON.stringify({ dest: destFile, rows: rows.length }, null, 2));
