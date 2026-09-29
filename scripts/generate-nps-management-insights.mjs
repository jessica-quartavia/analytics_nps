#!/usr/bin/env node
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { buildNpsManagementInsightsArtifacts } from '../lib/analytics/nps-management-insights-pipeline.mjs';

const latest = await readJson('snapshots/latest.json', null);
const { doc, qaDoc } = await buildNpsManagementInsightsArtifacts({
  dataCutoff: latest?.data_cutoff ?? new Date().toISOString(),
});

await writeJson('processed/nps_management_insights.json', doc);
await writeJson('quality/nps_management_insights_qa.json', qaDoc);

if (!doc.cross_check.ok) {
  console.error('QA cruzado FALHOU:', doc.cross_check.errors.join('; '));
  process.exitCode = 1;
}

console.log(
  `Management insights: ${doc.insights.length} insights · ${doc.executive_cards.length} cards · cross_check=${doc.cross_check.ok ? 'OK' : 'FAIL'}`,
);
