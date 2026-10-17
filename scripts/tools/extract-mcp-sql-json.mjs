#!/usr/bin/env node
/** Extrai JSON de resultado MCP execute_sql (stdout salvo em arquivo). */
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('Usage: node extract-mcp-sql-json.mjs <mcp-output.txt> <out.json>');
  process.exit(1);
}
const raw = readFileSync(inPath, 'utf8');
const marker = raw.indexOf('[{"ciclo"');
const start = marker >= 0 ? marker : raw.indexOf('[{');
const end = raw.lastIndexOf('}]');
if (start < 0 || end < 0) throw new Error('JSON array not found in MCP output');
const jsonText = raw.slice(start, end + 2).replace(/\\"/g, '"');
const rows = JSON.parse(jsonText);
writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 0));
console.log(JSON.stringify({ outPath, rows: rows.length }));
