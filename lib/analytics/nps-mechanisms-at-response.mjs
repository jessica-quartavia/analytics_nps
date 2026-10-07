import { classifyNpsScore } from './nps.mjs';

export function mechanismCountBucket(count) {
  if (count == null || Number.isNaN(count)) return null;
  const n = Number(count);
  if (n >= 2) return '2+';
  if (n === 1) return '1';
  if (n === 0) return '0';
  return null;
}

/** Dataset por resposta — somente status temporal conhecido entra nas faixas 0/1/2+. */
export function buildMechanismsAtResponseFromEnriched(enrichedResponses = []) {
  const entries = [];
  for (const r of enrichedResponses) {
    if (r.mechanism_temporal_status === 'date_unavailable') continue;
    const count = r.mechanisms_before_response ?? 0;
    entries.push({
      client_id: r.client_id,
      response_id: r.response_key ?? r.response_id ?? null,
      response_date: r.response_date,
      score: r.score,
      nps_category: r.nps_category ?? classifyNpsScore(r.score),
      analytical_cycle_code: r.nps_cycle ?? r.ciclo ?? r.analytical_cycle_code ?? null,
      mechanisms_before_response: count,
      implemented_mechanisms_before_response: r.implemented_mechanisms_before_response ?? 0,
      has_implemented_mechanism_at_response: Boolean(r.has_implemented_mechanism_at_response),
      mechanism_temporal_status: r.mechanism_temporal_status,
      mechanism_bucket: mechanismCountBucket(count),
    });
  }
  return entries;
}

export function buildMechanismsAtResponseFromMilestones(milestoneEntries = []) {
  const entries = [];
  for (const e of milestoneEntries) {
    if (e.mechanisms_quality === 'unavailable' || e.mechanisms_quality === 'partial') {
      if (e.mechanisms_count_before_response == null) continue;
    }
    if (e.mechanisms_count_before_response == null) continue;
    entries.push({
      client_id: e.client_id,
      response_id: `${e.client_id}:${e.analytical_cycle_code}:${e.submitted_at}`,
      response_date: e.submitted_at?.slice?.(0, 10) ?? null,
      score: e.score,
      nps_category: e.nps_category,
      analytical_cycle_code: e.analytical_cycle_code,
      mechanisms_before_response: e.mechanisms_count_before_response,
      implemented_mechanisms_before_response: e.has_mechanism_before_response ? e.mechanisms_count_before_response : 0,
      has_implemented_mechanism_at_response: e.has_mechanism_before_response === true,
      mechanism_temporal_status: e.mechanisms_quality === 'point_in_time' ? 'known_before' : 'known_before',
      mechanism_bucket: mechanismCountBucket(e.mechanisms_count_before_response),
    });
  }
  return entries;
}
