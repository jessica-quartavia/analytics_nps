import { runFileRefresh } from '../lib/pipeline/build-analytics.mjs';

export async function deriveHistory() {
  const result = await runFileRefresh();
  return { updated: result.responses.length };
}

if (process.argv[1]?.endsWith('derive-history.mjs')) {
  console.log(JSON.stringify({ ok: true, ...(await deriveHistory()) }, null, 2));
}
