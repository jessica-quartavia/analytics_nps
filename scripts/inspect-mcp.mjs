import { readFileSync } from 'node:fs';
const UNTRUSTED_RE = /<untrusted-data-[^>]+>\s*([\s\S]*?)\s*<\/untrusted-data-[^>]+>/g;
const p = process.argv[2];
const raw = readFileSync(p, 'utf8');
const outer = JSON.parse(raw);
for (const m of outer.result.matchAll(UNTRUSTED_RE)) {
  const inner = m[1].trim();
  console.log('block start', JSON.stringify(inner.slice(0, 30)));
  if (inner.startsWith('[')) {
    try {
      console.log('len', JSON.parse(inner).length);
    } catch (e) {
      console.log('fail', e.message);
    }
  }
}
