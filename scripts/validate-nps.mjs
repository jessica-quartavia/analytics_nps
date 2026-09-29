import { readJson } from '../lib/data/file-store.mjs';
import { validateProcessedResponses } from '../lib/pipeline/build-analytics.mjs';

export async function validateNps() {
  const responses = await readJson('processed/responses.json', []);
  const issues = validateProcessedResponses(responses);
  return {
    issues: issues.length,
    critical: issues.filter((i) => i.severity === 'critical').length,
    errors: issues.filter((i) => i.severity === 'error').length,
  };
}

if (process.argv[1]?.endsWith('validate-nps.mjs')) {
  console.log(JSON.stringify({ ok: true, ...(await validateNps()) }, null, 2));
}
