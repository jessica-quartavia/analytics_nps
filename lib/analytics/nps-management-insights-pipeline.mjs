import { readJson } from '../data/file-store.mjs';
import { buildManagementInsights, crossCheckManagementSources } from './nps-management-insights.mjs';

export async function buildNpsManagementInsightsArtifacts(opts = {}) {
  const cycleSummary = opts.cycleSummary ?? (await readJson('processed/cycle_summary.json', null));
  const pairedCycles = opts.pairedCycles ?? (await readJson('processed/paired_cycles.json', null));
  const changeDrivers = opts.changeDrivers ?? (await readJson('processed/nps_change_drivers.json', null));
  const financialProfile =
    opts.financialProfile ?? (await readJson('processed/nps_financial_profile.json', null));
  const responseTopics = opts.responseTopics ?? (await readJson('processed/response_topics.json', []));
  const responses = opts.responses ?? (await readJson('processed/responses.json', []));
  const milestonesSummary =
    opts.milestonesSummary ?? (await readJson('processed/nps_milestones_summary.json', null));

  const sources = {
    cycleSummary,
    pairedCycles,
    changeDrivers,
    financialProfile,
    responseTopics,
    responses,
    milestonesSummary,
  };

  const doc = buildManagementInsights(sources);
  if (opts.dataCutoff) doc.meta.generated_at = opts.dataCutoff;

  const qaDoc = {
    generated_at: doc.meta.generated_at,
    cycle_code: doc.meta.cycle_code,
    cross_check: doc.cross_check,
    insight_count: doc.insights.length,
    executive_card_count: doc.executive_cards.length,
    highlights: doc.insights.filter((i) => i.status === 'highlight').map((i) => i.id),
    failed: !doc.cross_check.ok,
  };

  return { doc, qaDoc };
}

export { crossCheckManagementSources };
