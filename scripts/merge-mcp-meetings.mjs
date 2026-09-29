#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

const snapshotId = process.argv[2];
const chunks = process.argv.slice(3);
const all = [];
for (const c of chunks) {
  all.push(...extractRows(readFileSync(c, 'utf8')));
}
await writeJson(`raw/${snapshotId}/client_meetings.json`, all);
console.log(JSON.stringify({ client_meetings: all.length }, null, 2));
