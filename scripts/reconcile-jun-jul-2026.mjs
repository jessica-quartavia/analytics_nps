/**
 * Gera data/quality/jun_jul_2026_reconciliation.json — SELECT no BASE QV apenas.
 */
import { writeJson } from '../lib/data/file-store.mjs';
import {
  confirmBaseQvReadOnly,
  createBaseQvClient,
  fetchNpsCycles,
  fetchNpsResponses,
  fetchClientsByIds,
} from '../lib/data/base-qv.mjs';
import {
  loadAnalyticalCycleConfig,
  buildJunJulPharusDataset,
} from '../lib/analytics/analytical-cycles.mjs';

export async function reconcileJunJul2026() {
  confirmBaseQvReadOnly();
  const baseQv = createBaseQvClient();
  const config = loadAnalyticalCycleConfig();
  const sourceCycles = await fetchNpsCycles(baseQv);
  const responses = await fetchNpsResponses(baseQv);

  const clientIds = [...new Set(responses.map((r) => r.client_id).filter(Boolean))];
  const clientsMap = await fetchClientsByIds(baseQv, clientIds);

  const dataset = buildJunJulPharusDataset(responses, clientsMap, config, sourceCycles);
  const rec = dataset.reconciliation;

  const report = {
    analytical_cycle: 'NPS-2026-JUN-JUL-PHARUS',
    analytical_cycle_name: 'Jun–Jul/2026',
    program: 'PHARUS',
    window: dataset.bounds,
    historical_expected: rec.historical_expected_responses,
    raw_pharus_responses: rec.source_raw_responses,
    distinct_clients: rec.valid_responses_after_dedupe,
    valid_after_dedupe: rec.valid_responses_after_dedupe,
    missing_vs_historical: rec.missing_vs_historical,
    historical_gap: rec.historical_gap,
    legacy_payload_missing: rec.legacy_payload_missing_count,
    duplicates_removed: dataset.duplicates_removed,
    nps_after_dedupe: dataset.npsSummary.nps,
    nps_summary: dataset.npsSummary,
    metadata: {
      historical_expected_responses: rec.historical_expected_responses,
      source_raw_responses: rec.source_raw_responses,
      valid_responses_after_dedupe: rec.valid_responses_after_dedupe,
      historical_gap: rec.historical_gap,
      historical_reconciliation_status: rec.historical_reconciliation_status,
      reconstruction_status: rec.reconstruction_status,
      reconstruction_confidence: rec.reconstruction_confidence,
    },
    dedupe_removed: dataset.removed.map((d) => ({
      client_id: d.removed.client_id,
      kept_response_id: d.kept.id ?? d.kept.source_response_id,
      removed_response_id: d.removed.id ?? d.removed.source_response_id,
      kept_submitted_at: d.kept.submitted_at,
      removed_submitted_at: d.removed.submitted_at,
    })),
    status: 'partial',
    generated_at: new Date().toISOString(),
    source: 'BASE_QV SELECT',
  };

  await writeJson('quality/jun_jul_2026_reconciliation.json', report);
  return report;
}

if (process.argv[1]?.endsWith('reconcile-jun-jul-2026.mjs')) {
  const report = await reconcileJunJul2026();
  console.log(JSON.stringify({ ok: true, nps: report.nps_after_dedupe, valid: report.valid_after_dedupe }, null, 2));
}
