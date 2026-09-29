#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { writeJson } from '../lib/data/file-store.mjs';
import { extractRows } from './ingest-mcp-sql-export.mjs';

const mcpPath = process.argv[2];
const snapshotId = process.argv[3];
const destFile = process.argv[4];
const rows = extractRows(readFileSync(mcpPath, 'utf8'));
await writeJson(`raw/${snapshotId}/${destFile}`, rows);
console.log(JSON.stringify({ dest: destFile, rows: rows.length }, null, 2));
