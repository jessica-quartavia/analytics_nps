import { createBaseQvClient, fetchNpsCycles, confirmBaseQvReadOnly } from '../lib/data/base-qv.mjs';
import { syncCyclesFromSource } from '../lib/pipeline/build-analytics.mjs';
import { writeJson } from '../lib/data/file-store.mjs';

export async function syncCycles() {
  confirmBaseQvReadOnly();
  const baseQv = createBaseQvClient();
  const sourceCycles = await fetchNpsCycles(baseQv);
  const cycles = syncCyclesFromSource(sourceCycles);
  await writeJson('processed/cycles.json', cycles);
  return { cycles: cycles.length };
}

if (process.argv[1]?.endsWith('sync-cycles.mjs')) {
  console.log(JSON.stringify({ ok: true, ...(await syncCycles()) }, null, 2));
}
