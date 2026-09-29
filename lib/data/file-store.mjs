import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../data');

export const DATA_PATHS = {
  raw: join(ROOT, 'raw'),
  processed: join(ROOT, 'processed'),
  snapshots: join(ROOT, 'snapshots'),
  outputs: join(ROOT, 'outputs'),
  quality: join(ROOT, 'quality'),
};

export function getProjectDataRoot() {
  return ROOT;
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

export async function writeJson(relativePath, data) {
  const full = join(ROOT, relativePath);
  await ensureDir(dirname(full));
  await writeFile(full, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return full;
}

export async function readJson(relativePath, fallback = null) {
  const full = join(ROOT, relativePath);
  try {
    const text = await readFile(full, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (fallback !== null && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

/**
 * Abstração tabular: preferência Parquet; implementação atual JSON (mesma pasta lógica).
 * @param {'processed'|'outputs'} bucket
 * @param {string} baseName ex: responses (grava responses.json; .parquet quando habilitado)
 * @param {Array<object>} rows
 */
export async function writeTable(bucket, baseName, rows) {
  const useParquet = process.env.ANALYTICS_USE_PARQUET === '1';
  const dir = bucket === 'outputs' ? 'outputs' : 'processed';
  if (useParquet) {
    try {
      const { writeParquetTable } = await import('./parquet-writer.mjs');
      return writeParquetTable(join(ROOT, dir, `${baseName}.parquet`), rows);
    } catch {
      // fallback below
    }
  }
  return writeJson(`${dir}/${baseName}.json`, rows);
}

export function formatRawSnapshotDir(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export async function writeRawSnapshot(snapshotId, files) {
  const dir = `raw/${snapshotId}`;
  const written = [];
  for (const [name, payload] of Object.entries(files)) {
    written.push(await writeJson(`${dir}/${name}`, payload));
  }
  return { snapshotId, dir, written };
}
