import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const partialsDir = join(dirname(fileURLToPath(import.meta.url)), '../data/ingest/partials');

const [, , filename, inputPath] = process.argv;
if (!filename || !inputPath) {
  console.error('Uso: node scripts/save-ingest-partial.mjs <filename> <input-json-path>');
  process.exit(1);
}

await mkdir(partialsDir, { recursive: true });
const data = JSON.parse(readFileSync(inputPath, 'utf8'));
await writeFile(join(partialsDir, filename), `${JSON.stringify(data)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, filename, rows: Array.isArray(data) ? data.length : 1 }));
