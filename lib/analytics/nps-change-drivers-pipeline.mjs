import { readJson } from '../data/file-store.mjs';
import { buildNpsChangeDriversDoc } from './nps-change-drivers.mjs';

export async function buildNpsChangeDriverArtifacts(opts = {}) {
  const betweenDoc =
    opts.betweenDoc ?? (await readJson('processed/nps_between_cycle_events.json', null));
  const milestonesDoc =
    opts.clientMilestonesDoc ?? (await readJson('processed/nps_client_milestones.json', null));
  const responseTopics = opts.responseTopics ?? (await readJson('processed/response_topics.json', []));
  const responses = opts.responses ?? (await readJson('processed/responses.json', []));
  const pairedDoc = opts.pairedDoc ?? (await readJson('processed/paired_cycles.json', null));
  const summaryDoc = opts.summaryDoc ?? (await readJson('processed/nps_milestones_summary.json', null));

  const betweenEvents = betweenDoc?.entries ?? [];
  const milestoneEntries = milestonesDoc?.entries ?? [];
  const currentCycle = betweenDoc?.meta?.current_cycle ?? pairedDoc?.current_cycle;
  const sourcesLoaded = milestonesDoc?.meta?.sources_loaded ?? summaryDoc?.meta?.sources_loaded ?? {};
  const milestoneCoverage = summaryDoc?.meta?.coverage_by_field ?? {};

  const driversDoc = buildNpsChangeDriversDoc({
    betweenEvents,
    milestoneEntries,
    responseTopics: Array.isArray(responseTopics) ? responseTopics : [],
    responses,
    currentCycle,
    sourcesLoaded,
    milestoneCoverage,
    dataCutoff: opts.dataCutoff ?? betweenDoc?.meta?.data_cutoff,
  });

  const qaDoc = {
    generated_at: driversDoc.meta.generated_at,
    current_cycle: currentCycle,
    paired_transitions: driversDoc.meta.paired_transitions,
    coverage: driversDoc.coverage,
    auto_insights_count: driversDoc.auto_insights?.length ?? 0,
    churn_quality: driversDoc.churn?.quality,
    limitations: driversDoc.limitations,
  };

  return { driversDoc, qaDoc };
}
