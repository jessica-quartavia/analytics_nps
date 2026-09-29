/**
 * ETAPA 2.2 — diagnóstico pré-T2 (somente SELECT no BASE QV).
 * Escreve apenas arquivos em data/quality/pre_t2_*.json
 */
import { createBaseQvClient, confirmBaseQvReadOnly } from '../lib/data/base-qv.mjs';
import { writeJson } from '../lib/data/file-store.mjs';
import { buildPreT2Diagnostics } from '../lib/diagnostics/pre-t2-analysis.mjs';

export async function runPreT2Diagnosis() {
  confirmBaseQvReadOnly();
  const baseQv = createBaseQvClient();
  const report = await buildPreT2Diagnostics(baseQv);

  await writeJson('quality/pre_t2_timeline.json', report.timeline);
  await writeJson('quality/pre_t2_forms.json', report.forms);
  await writeJson('quality/pre_t2_vs_t2_form_comparison.json', report.formComparison);
  await writeJson('quality/pre_t2_repeat_clients.json', report.repeatClients);
  await writeJson('quality/pre_t2_cycle_candidates.json', report.cycleCandidates);
  await writeJson('quality/pre_t2_ambiguous_responses.json', report.ambiguousResponses);

  return report.meta;
}

if (process.argv[1]?.endsWith('diagnose-pre-t2.mjs')) {
  const meta = await runPreT2Diagnosis();
  console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
}
