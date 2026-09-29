import { runFileRefresh } from '../lib/pipeline/build-analytics.mjs';

export async function buildActionQueue() {
  const result = await runFileRefresh();
  return { action_queue_rows: result.actionQueue.length };
}

if (process.argv[1]?.endsWith('build-action-queue.mjs')) {
  console.log(JSON.stringify({ ok: true, ...(await buildActionQueue()) }, null, 2));
}
