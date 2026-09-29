import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CACHE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/cache/voc_ai_classifications.json',
);

export function vocAiCacheKey(payload, { promptVersion, model }) {
  const h = createHash('sha256');
  h.update(JSON.stringify({ promptVersion, model, payload }));
  return h.digest('hex');
}

export function loadVocAiCache(cachePath = DEFAULT_CACHE_PATH) {
  try {
    if (!existsSync(cachePath)) return { version: 1, entries: {} };
    const doc = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (!doc.entries || typeof doc.entries !== 'object') return { version: 1, entries: {} };
    return doc;
  } catch {
    return { version: 1, entries: {} };
  }
}

export function saveVocAiCache(doc, cachePath = DEFAULT_CACHE_PATH) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

export function getCachedClassification(cacheDoc, key) {
  return cacheDoc.entries[key] ?? null;
}

export function setCachedClassification(cacheDoc, key, value) {
  cacheDoc.entries[key] = value;
}
