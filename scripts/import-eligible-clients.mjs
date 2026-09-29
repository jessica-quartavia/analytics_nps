/** Alias — elegíveis são gerados no refresh completo. */
import { runFileRefresh } from '../lib/pipeline/build-analytics.mjs';

export async function importEligibleClients() {
  const result = await runFileRefresh();
  return { eligible_clients: result.eligible.length };
}

if (process.argv[1]?.endsWith('import-eligible-clients.mjs')) {
  console.log(JSON.stringify({ ok: true, ...(await importEligibleClients()) }, null, 2));
}
