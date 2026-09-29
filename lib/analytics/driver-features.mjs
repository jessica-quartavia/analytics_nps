import { isValidScore, classifyNpsScore } from './nps.mjs';
import { isDeteriorated } from './driver-config.mjs';

function qualityWeight(q) {
  if (q === 'point_in_time') return 1;
  if (q === 'current_proxy') return 0.85;
  if (q === 'partial') return 0.7;
  return 0.5;
}

function daysBetween(a, b) {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.floor((t2 - t1) / (86400000));
}

function csatStatsBefore(csatRows, clientId, submittedAt) {
  const t = new Date(submittedAt).getTime();
  const rows = csatRows.filter(
    (r) =>
      r.client_id === clientId &&
      r.submitted_at &&
      new Date(r.submitted_at).getTime() <= t,
  );
  if (!rows.length) return { average: null, count: rows.length, has: false };
  const scores = rows.map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { average: avg, count: rows.length, has: true, latest: rows.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0]?.score };
}

function meetingStats(meetings, clientId, submittedAt) {
  const t = new Date(submittedAt).getTime();
  const rows = (meetings ?? []).filter(
    (m) =>
      m.client_id === clientId &&
      m.start_time &&
      new Date(m.start_time).getTime() <= t,
  );
  const t30 = t - 30 * 86400000;
  const t90 = t - 90 * 86400000;
  const last30 = rows.filter((m) => new Date(m.start_time).getTime() >= t30).length;
  const last90 = rows.filter((m) => new Date(m.start_time).getTime() >= t90).length;
  const sorted = [...rows].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const daysSince = sorted[0] ? daysBetween(sorted[0].start_time, submittedAt) : null;
  return {
    count: rows.length,
    last_30d: last30,
    last_90d: last90,
    days_since_last: daysSince,
    quality: meetings?.length ? 'point_in_time' : 'unavailable',
  };
}

function mechanismStats(mecs, clientId, submittedAt) {
  const t = new Date(submittedAt).getTime();
  const rows = (mecs ?? []).filter(
    (m) =>
      m.client_id === clientId &&
      m.implemented_at &&
      new Date(m.implemented_at).getTime() <= t,
  );
  return {
    count: rows.length,
    has: rows.length > 0,
    quality: mecs?.length ? 'point_in_time' : 'unavailable',
  };
}

/**
 * @param {Array<object>} responses
 * @param {object} ctx
 */
export function buildDriverFeatures(responses, ctx = {}) {
  const {
    csatResponses = [],
    responseTopics = [],
    clientsById = new Map(),
    meetings = [],
    mechanisms = [],
    topicsByResponse = null,
  } = ctx;

  const topicMap = topicsByResponse ?? new Map();
  if (!topicsByResponse) {
    for (const t of responseTopics) {
      if (!topicMap.has(t.response_id)) topicMap.set(t.response_id, []);
      topicMap.get(t.response_id).push({ topic: t.topic, valence: t.valence });
    }
  }

  const features = [];
  for (const r of responses) {
    if (!r.client_id || !r.analytical_cycle_code || !isValidScore(r.score)) continue;
    const client = clientsById.get(r.client_id);
    const submittedAt = r.submitted_at;
    const csat = csatStatsBefore(csatResponses, r.client_id, submittedAt);
    const meet = meetingStats(meetings, r.client_id, submittedAt);
    const mech = mechanismStats(mechanisms, r.client_id, submittedAt);

    let meetingsCount = meet.count;
    let meetingsQuality = meet.quality;
    if (meetingsQuality === 'unavailable' && csat.count > 0) {
      meetingsCount = csat.count;
      meetingsQuality = 'partial';
    }

    const tenureDays =
      client?.data_inicio_ciclo && submittedAt
        ? daysBetween(client.data_inicio_ciclo, submittedAt)
        : null;

    const topics = topicMap.get(r.response_id) ?? [];
    const negativeTopics = topics.filter((t) => t.valence === 'Negativa').length;
    const positiveTopics = topics.filter((t) => t.valence === 'Positiva').length;

    const epQuality =
      r.ep_resolution_confidence === 'high'
        ? 'point_in_time'
        : r.ep_resolution_method === 'current_proxy'
          ? 'current_proxy'
          : 'partial';

    features.push({
      client_id: r.client_id,
      analytical_cycle_code: r.analytical_cycle_code,
      response_id: r.response_id,
      score: r.score,
      nps_category: r.nps_category ?? classifyNpsScore(r.score),
      is_detractor: (r.nps_category ?? classifyNpsScore(r.score)) === 'Detrator',
      previous_score: r.previous_score ?? null,
      score_delta: r.score_delta ?? null,
      migration: r.nps_migration ?? null,
      deteriorated: isDeteriorated(r),
      ep_id: r.ep_id ?? null,
      ep_name: r.ep_name ?? null,
      tenure_days: tenureDays,
      tenure_months: tenureDays != null ? tenureDays / 30.44 : null,
      journey_stage: r.journey_stage ?? null,
      program: r.program ?? null,
      segment: r.segment ?? null,
      engagement_status: client?.engajamento ?? null,
      meetings_count: meetingsCount,
      meetings_last_30d: meet.last_30d,
      meetings_last_90d: meet.last_90d,
      days_since_last_meeting: meet.days_since_last ?? null,
      attendance_rate: null,
      mechanisms_count: mech.count,
      has_mechanism: mech.has,
      contract_cycle: null,
      days_to_cycle_end: null,
      app_pharus_access: client?.app_pharus_access ?? null,
      csat_average: csat.average,
      latest_csat_score: csat.latest ?? null,
      has_csat: csat.has,
      topics,
      negative_topics_count: negativeTopics,
      positive_topics_count: positiveTopics,
      is_paired: Boolean(r.is_paired_with_previous),
      feature_quality: {
        ep: epQuality,
        meetings: meetingsQuality,
        mechanisms: mech.quality,
        csat: csat.has ? 'point_in_time' : 'unavailable',
        tenure: client?.data_inicio_ciclo ? 'point_in_time' : 'current_proxy',
        engagement: client?.engajamento ? 'current_proxy' : 'unavailable',
      },
      quality_weight: qualityWeight(epQuality),
    });
  }
  return features;
}

export function averageFeatureCoverage(features, field) {
  if (!features.length) return 0;
  let ok = 0;
  for (const f of features) {
    const v = f[field];
    if (v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) ok++;
  }
  return ok / features.length;
}
