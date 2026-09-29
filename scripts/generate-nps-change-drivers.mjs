#!/usr/bin/env node
import { writeJson } from '../lib/data/file-store.mjs';
import { buildNpsChangeDriverArtifacts } from '../lib/analytics/nps-change-drivers-pipeline.mjs';
import { readJson } from '../lib/data/file-store.mjs';

const latest = await readJson('snapshots/latest.json', null);
const { driversDoc, qaDoc } = await buildNpsChangeDriverArtifacts({
  dataCutoff: latest?.data_cutoff ?? new Date().toISOString(),
});

await writeJson('processed/nps_change_drivers.json', driversDoc);
await writeJson('quality/nps_change_drivers_qa.json', qaDoc);

console.log(
  `Drivers mudança NPS: ${driversDoc.meta.paired_transitions} transições · ${driversDoc.auto_insights?.length ?? 0} insights automáticos`,
);
