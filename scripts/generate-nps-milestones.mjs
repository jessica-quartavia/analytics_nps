#!/usr/bin/env node
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { buildNpsMilestoneArtifacts } from '../lib/analytics/nps-milestones-pipeline.mjs';

const responses = await readJson('processed/responses.json', []);
const pairedDoc = await readJson('processed/paired_cycles.json', null);
const latest = await readJson('snapshots/latest.json', null);

const rawSnapshotId = process.env.MILESTONES_RAW_SNAPSHOT ?? latest?.raw_snapshot ?? null;

const artifacts = await buildNpsMilestoneArtifacts(responses, {
  rawSnapshotId,
  pairedDoc,
  dataCutoff: latest?.data_cutoff ?? new Date().toISOString(),
});

await writeJson('processed/nps_client_milestones.json', artifacts.clientMilestonesDoc);
await writeJson('processed/nps_milestones_summary.json', artifacts.summaryDoc);
await writeJson('processed/nps_between_cycle_events.json', artifacts.betweenDoc);
await writeJson('quality/nps_milestones_qa.json', artifacts.qaDoc);

console.log(
  `Marcos NPS: ${artifacts.clientMilestonesDoc.entries.length} linhas · QA em data/quality/nps_milestones_qa.json`,
);

const { buildNpsChangeDriverArtifacts } = await import('../lib/analytics/nps-change-drivers-pipeline.mjs');
const changeArtifacts = await buildNpsChangeDriverArtifacts({
  betweenDoc: artifacts.betweenDoc,
  clientMilestonesDoc: artifacts.clientMilestonesDoc,
  summaryDoc: artifacts.summaryDoc,
  dataCutoff: latest?.data_cutoff ?? new Date().toISOString(),
});
await writeJson('processed/nps_change_drivers.json', changeArtifacts.driversDoc);
await writeJson('quality/nps_change_drivers_qa.json', changeArtifacts.qaDoc);
console.log(`Drivers mudança: ${changeArtifacts.driversDoc.meta.paired_transitions} transições pareadas`);
