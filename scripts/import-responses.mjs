/** @deprecated Use npm run refresh:nps — mantido como alias parcial. */
import { runFileRefresh } from '../lib/pipeline/build-analytics.mjs';

export async function importResponses(opts = {}) {
  const result = await runFileRefresh({ writeFiles: opts.writeFiles !== false });
  return {
    loaded: result.responses,
    stats: result.runRecord,
    qualityEntries: result.qualityEntries,
  };
}

if (process.argv[1]?.endsWith('import-responses.mjs')) {
  const result = await importResponses();
  console.log(JSON.stringify({ ok: true, stats: result.stats }, null, 2));
}
