#!/usr/bin/env node
import { writeJson, readJson } from '../lib/data/file-store.mjs';
import { buildNpsFinancialProfileArtifacts } from '../lib/analytics/nps-financial-profile-pipeline.mjs';

const latest = await readJson('snapshots/latest.json', null);
const { profileDoc, qaDoc } = await buildNpsFinancialProfileArtifacts({
  dataCutoff: latest?.data_cutoff ?? new Date().toISOString(),
});

await writeJson('processed/nps_financial_profile.json', profileDoc);
await writeJson('quality/nps_financial_profile_qa.json', qaDoc);

const cov = profileDoc.financial_profile_coverage;
console.log(
  `Perfil financeiro NPS: n=${cov.respondents_total} · fin=${cov.financial_rows} · Tier classificados=${cov.tier_classified} · unavailable=${cov.tier_unavailable}`,
);
