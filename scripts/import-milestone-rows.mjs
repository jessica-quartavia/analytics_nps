#!/usr/bin/env node
/** Acrescenta linhas exportadas (SELECT) a um JSON raw; reinicia se --reset */
import { readFileSync } from 'node:fs';
import { readJson, writeJson } from '../lib/data/file-store.mjs';

const snapshotId = process.argv[2];
const fileName = process.argv[3];
const reset = process.argv.includes('--reset');
const chunkPath = process.argv.find((a) => a.endsWith('.json') && !a.includes('milestones'));

if (!snapshotId || !fileName || !chunkPath) {
  console.error(
    'Uso: import-milestone-rows.mjs <snapshotId> <file.json> chunk.json [--reset]',
  );
  process.exit(1);
}

const chunk = JSON.parse(readFileSync(chunkPath, 'utf8'));
if (!Array.isArray(chunk)) {
  console.error('chunk deve ser array JSON');
  process.exit(1);
}

const rel = `raw/${snapshotId}/${fileName}`;
const prev = reset ? [] : await readJson(rel, []);
const merged = prev.concat(chunk);
await writeJson(rel, merged);
console.log(JSON.stringify({ file: fileName, added: chunk.length, total: merged.length }, null, 2));
