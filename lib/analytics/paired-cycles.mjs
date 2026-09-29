import { calculateNps } from './nps.mjs';

/**
 * Métricas pareadas: exatamente os mesmos client_id nos dois ciclos.
 * @param {string} previousCycleCode
 * @param {string} currentCycleCode
 * @param {Array<{ client_id: string, analytical_cycle_code: string, score: number }>} responses
 */
export function buildPairedCycleMetrics(previousCycleCode, currentCycleCode, responses) {
  const byClient = new Map();
  for (const r of responses) {
    if (!r.client_id) continue;
    if (r.analytical_cycle_code !== previousCycleCode && r.analytical_cycle_code !== currentCycleCode) {
      continue;
    }
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, {});
    byClient.get(r.client_id)[r.analytical_cycle_code] = r;
  }

  const prevScores = [];
  const currScores = [];
  const pairedClientIds = [];

  for (const [clientId, byCycle] of byClient) {
    const prev = byCycle[previousCycleCode];
    const curr = byCycle[currentCycleCode];
    if (!prev || !curr) continue;
    pairedClientIds.push(clientId);
    prevScores.push(prev.score);
    currScores.push(curr.score);
  }

  const previous_nps_paired = calculateNps(prevScores.map((score) => ({ score })));
  const current_nps_paired = calculateNps(currScores.map((score) => ({ score })));
  const delta_nps_paired =
    previous_nps_paired != null && current_nps_paired != null
      ? current_nps_paired - previous_nps_paired
      : null;

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const previous_average_score = avg(prevScores);
  const current_average_score = avg(currScores);
  const average_score_delta =
    previous_average_score != null && current_average_score != null
      ? current_average_score - previous_average_score
      : null;

  return {
    current_cycle: currentCycleCode,
    previous_cycle: previousCycleCode,
    paired_clients: pairedClientIds.length,
    paired_client_ids: pairedClientIds,
    previous_nps_paired,
    current_nps_paired,
    delta_nps_paired,
    previous_average_score,
    current_average_score,
    average_score_delta,
  };
}

/**
 * @param {string} previousCycleCode
 * @param {string} currentCycleCode
 * @param {Array<object>} responses
 */
export function markPairedWithPrevious(previousCycleCode, currentCycleCode, responses) {
  const metrics = buildPairedCycleMetrics(previousCycleCode, currentCycleCode, responses);
  const pairedSet = new Set(metrics.paired_client_ids);
  return responses.map((r) => ({
    ...r,
    is_paired_with_previous:
      r.analytical_cycle_code === currentCycleCode && pairedSet.has(r.client_id),
  }));
}
