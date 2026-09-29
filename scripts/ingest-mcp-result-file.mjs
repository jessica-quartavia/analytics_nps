#!/usr/bin/env node
/** Grava snapshot a partir de arquivo de resposta MCP (JSON com campo result). */
import { readFileSync } from 'node:fs';
import { writeJson } from '../lib/data/file-store.mjs';

function extractRows(raw) {
  let payload = raw;
  try {
    const outer = JSON.parse(raw);
    if (typeof outer?.result === 'string') payload = outer.result;
  } catch {
    /* */
  }
  const start = payload.indexOf('[{"');
  const end = payload.lastIndexOf('}]');
  return JSON.parse(payload.slice(start, end + 2));
}

const [mcpPath, snapshotId, destFile] = process.argv.slice(2);
const rows = extractRows(readFileSync(mcpPath, 'utf8'));
await writeJson(`raw/${snapshotId}/${destFile}`, rows);
console.log(JSON.stringify({ dest: destFile, rows: rows.length }, null, 2));
