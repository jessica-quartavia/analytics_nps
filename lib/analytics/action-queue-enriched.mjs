import {
  RECOMMENDED_ACTION_BY_PRIORITY,
  PRIORITY_ORDER,
} from './action-config.mjs';
import { computeActionPriority, sortByPriority } from './action-priority.mjs';

function indexTopicsByResponse(responseTopics) {
  const byResponse = new Map();
  for (const t of responseTopics ?? []) {
    if (!byResponse.has(t.response_id)) byResponse.set(t.response_id, []);
    byResponse.get(t.response_id).push(t);
  }
  return byResponse;
}

function buildClientSatMap(clientSatisfactionDoc) {
  const map = new Map();
  for (const e of clientSatisfactionDoc?.entries ?? []) {
    map.set(e.client_id, e);
  }
  return map;
}

function responseById(responses) {
  const map = new Map();
  for (const r of responses ?? []) {
    if (r.response_id) map.set(r.response_id, r);
  }
  return map;
}

function primaryTopic(topics) {
  if (!topics?.length) return null;
  const neg = topics.filter((t) => t.valence === 'Negativa');
  const pool = neg.length ? neg : topics;
  const sorted = [...pool].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const t = sorted[0];
  return t ? `${t.topic} (${t.valence})` : null;
}

function aggregateDriverContext(driversSummary, cycleCode) {
  if (!driversSummary?.entries?.length) return null;
  const top = driversSummary.entries
    .filter((e) => e.cycle_code === cycleCode && e.significant_fdr_05)
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))[0];
  if (!top?.reading_hint) return null;
  return `Contexto associado observado na base: ${top.reading_hint}`;
}

/**
 * @param {object} params
 * @returns {{ entries: object[], meta: object }}
 */
export function buildActionQueueEnriched(params) {
  const {
    actionQueue = [],
    responses = [],
    responseTopics = [],
    clientSatisfactionDoc = null,
    driversSummary = null,
    cycleCode,
    dataCutoff = null,
  } = params;

  const topicsByResponse = indexTopicsByResponse(responseTopics);
  const satMap = buildClientSatMap(clientSatisfactionDoc);
  const respMap = responseById(responses);
  const populationContext = aggregateDriverContext(driversSummary, cycleCode);

  const entries = [];

  for (const item of actionQueue) {
    if (cycleCode && item.cycle_code !== cycleCode) continue;
    const resp = respMap.get(item.response_id) ?? responses.find(
      (r) => r.client_id === item.client_id && r.analytical_cycle_code === item.cycle_code,
    );
    const topicsRaw = topicsByResponse.get(item.response_id) ?? [];
    const topics = topicsRaw.map((t) => ({
      topic: t.topic,
      valence: t.valence,
      classification_source: t.classification_source,
    }));
    const negative_topics = topics.filter((t) => t.valence === 'Negativa');
    const positive_topics = topics.filter((t) => t.valence === 'Positiva');
    const sat = satMap.get(item.client_id);

    const ctx = {
      has_csat: sat?.has_csat ?? false,
      latest_csat_score: sat?.latest_csat_score ?? null,
      csat_average: sat?.csat_average ?? null,
      negative_topics_count: negative_topics.length,
      topics_count: topics.length,
      topics: topicsRaw,
      comment: item.comment,
    };

    const priorityRow = {
      nps_migration: item.nps_migration,
      evolution_status: resp?.evolution_status ?? null,
      nps_category: item.current_category,
      previous_category: item.previous_category,
      score_delta: item.score_delta,
      current_score: item.current_score,
      consecutive_detractor: resp?.consecutive_detractor ?? false,
      promotor_consistent: resp?._promotor_consistent ?? false,
      critical_flag: resp?.critical_flag ?? item.critical_flag ?? false,
      comment: item.comment,
      is_paired_with_previous: resp?.is_paired_with_previous ?? item.previous_score != null,
    };
    const computed = computeActionPriority(priorityRow, ctx);
    const priority = computed.priority ?? item.priority;
    const reason =
      computed.priority_reasons.length > 0
        ? computed.priority_reasons.join('; ')
        : item.reason ?? '';

    entries.push({
      priority,
      reason,
      priority_rules: computed.priority_reasons,
      other_signals: computed.other_signals,
      qualitative_signal: computed.qualitative_signal,
      population_context: populationContext,

      client_id: item.client_id,
      client_name: item.client_name,

      ep_id: resp?.ep_id ?? null,
      ep_name: item.ep_name ?? resp?.ep_name ?? null,
      ep_resolution_confidence: resp?.ep_resolution_confidence ?? null,

      cycle_code: item.cycle_code,
      response_id: item.response_id,

      previous_score: item.previous_score,
      current_score: item.current_score,
      score_delta: item.score_delta,

      previous_category: item.previous_category,
      current_category: item.current_category,
      nps_migration: item.nps_migration,

      evolution_status: resp?.evolution_status ?? null,

      comment: item.comment ?? null,
      topics,
      negative_topics,
      positive_topics,
      primary_topic: primaryTopic(topicsRaw),

      csat_average: sat?.csat_average ?? null,
      latest_csat_score: sat?.latest_csat_score ?? null,
      has_csat: sat?.has_csat ?? false,
      csat_responses_count: sat?.csat_responses_count ?? 0,

      critical_flag: resp?.critical_flag ?? false,

      recommended_action_type:
        RECOMMENDED_ACTION_BY_PRIORITY[item.priority] ?? 'Sem ação imediata',

      quality_notes: buildQualityNotes(resp, topicsRaw, sat),
    });
  }

  entries.sort(sortByPriority);

  const counts = Object.fromEntries(PRIORITY_ORDER.map((p) => [p, 0]));
  for (const e of entries) {
    counts[e.priority] = (counts[e.priority] ?? 0) + 1;
  }

  return {
    entries,
    meta: {
      cycle_code: cycleCode,
      data_cutoff: dataCutoff,
      total: entries.length,
      counts_by_priority: counts,
      population_context: populationContext,
    },
  };
}

function buildQualityNotes(resp, topicsRaw, sat) {
  const notes = [];
  if (resp?.ep_resolution_confidence === 'low') {
    notes.push('EP reconstruído (proxy atual); interpretar com cautela.');
  }
  if (topicsRaw.some((t) => t.classification_source === 'rules_v1')) {
    notes.push('Temas classificados por rules_v1 (revisão humana recomendada).');
  }
  if (!sat?.has_csat) {
    notes.push('Sem CSAT registrado para o cliente.');
  }
  return notes;
}
