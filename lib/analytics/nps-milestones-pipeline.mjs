import { readJson } from '../data/file-store.mjs';
import {
  loadMilestoneSourcesFromDir,
  resolveMilestoneRawDir,
} from './milestone-source-loader.mjs';
import {
  buildNpsClientMilestones,
  buildNpsMilestonesSummary,
  buildBetweenCycleEvents,
  buildMilestoneCoverage,
  prepareSourceBundle,
} from './nps-milestones.mjs';
import {
  enrichBetweenEventsWithMilestoneRows,
  buildMigrationAnalysisPack,
  buildMilestonesQaDoc,
} from './nps-milestones-stats.mjs';

/**
 * Gera artefatos de marcos da jornada a partir de responses processadas + raw snapshot.
 */
export async function buildNpsMilestoneArtifacts(responses, opts = {}) {
  const dataRoot = opts.dataRoot ?? 'data';
  const rawDir = await resolveMilestoneRawDir(dataRoot, opts);
  const { loaded, counts: sources_loaded } = rawDir
    ? await loadMilestoneSourcesFromDir(rawDir)
    : { loaded: {}, counts: {} };

  const bundle = prepareSourceBundle(loaded);
  const { entries } = buildNpsClientMilestones(responses, bundle);

  const cycleCodes = [...new Set(entries.map((e) => e.analytical_cycle_code))].sort();
  const pairedDoc = opts.pairedDoc ?? (await readJson('processed/paired_cycles.json', null));

  let betweenEvents = buildBetweenCycleEvents(entries, pairedDoc);
  betweenEvents = enrichBetweenEventsWithMilestoneRows(betweenEvents, entries, bundle);

  const summaryCore = buildNpsMilestonesSummary(entries, cycleCodes);
  const coverage = buildMilestoneCoverage(entries);
  const currentCycle = pairedDoc?.current_cycle ?? cycleCodes[cycleCodes.length - 1];
  const migration_analysis = buildMigrationAnalysisPack(betweenEvents, currentCycle);

  const dataCutoff = opts.dataCutoff ?? new Date().toISOString();

  const clientMilestonesDoc = {
    meta: {
      data_cutoff: dataCutoff,
      raw_snapshot_dir: rawDir,
      sources_loaded,
      methodology_note:
        'Marcos calculados com event_at <= submitted_at. Sem inferência causal. Somente PHARUS.',
    },
    entries,
  };

  const summaryDoc = {
    meta: {
      data_cutoff: dataCutoff,
      raw_snapshot_dir: rawDir,
      sources_loaded,
      coverage_by_field: coverage,
    },
    ...summaryCore,
    migration_analysis,
  };

  const betweenDoc = {
    meta: { data_cutoff: dataCutoff, current_cycle: currentCycle },
    entries: betweenEvents,
  };

  const qaDoc = buildMilestonesQaDoc({
    entries,
    sources: sources_loaded,
    coverage,
    rawDir,
    dataCutoff,
  });

  return {
    clientMilestonesDoc,
    summaryDoc,
    betweenDoc,
    qaDoc,
  };
}
