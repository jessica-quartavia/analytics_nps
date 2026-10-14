/**
 * Kernel NPS no browser — espelha lib/analytics/nps.mjs (import relativo servido via /lib/ no dev e no dist).
 */
export {
  classifyNpsScore,
  isValidScore,
  isValidNpsScore,
  npsCategory,
  npsScoreFromRow,
  npsClientId,
  npsResponseTimestampMs,
  dedupeLatestNpsByClient,
  aggregateNpsFromResponses,
  formatNpsAggregateResult,
  calculateNps,
  calculateNpsSummary,
  filterValidNpsResponses,
  latestNpsResponseMeta,
  aggregateNpsForAnalyticalCycle,
  aggregateNpsForOfficialSourceCycleWindow,
  filterOfficialSourceCycleWindowRows,
  meanNpsScoreFromRows,
} from '../../../lib/analytics/nps.mjs';
