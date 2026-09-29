#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { writeJson } from '../lib/data/file-store.mjs';

const snapshotId = process.argv[2] ?? '2026-09-28T21-06-04';
const chunks = process.argv.slice(3);
const all = [];
for (const c of chunks) {
  all.push(...JSON.parse(readFileSync(c, 'utf8')));
}
await writeJson(`raw/${snapshotId}/cancellations.json`, all);
console.log(JSON.stringify({ cancellations: all.length }, null, 2));
