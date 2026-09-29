import { readJson, writeJson } from '../data/file-store.mjs';

/**
 * Append-only quality log (file-based).
 * @param {object|object[]} entry
 */
export async function logQualityBatch(entry) {
  const entries = Array.isArray(entry) ? entry : [entry];
  if (!entries.length) return;
  const store = await readJson('quality/data_quality.json', { entries: [] });
  store.entries.push(
    ...entries.map((e) => ({
      ...e,
      created_at: e.created_at ?? new Date().toISOString(),
    })),
  );
  store.updated_at = new Date().toISOString();
  await writeJson('quality/data_quality.json', store);
}

export async function logQuality(entry) {
  return logQualityBatch([entry]);
}
