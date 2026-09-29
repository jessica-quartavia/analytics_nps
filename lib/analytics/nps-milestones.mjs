import { isValidScore, classifyNpsScore } from './nps.mjs';
import {
  daysBetween,
  isOnOrBefore,
  isStrictlyBetween,
  mean,
  median,
  pctTrue,
  parseTs,
} from './milestone-temporal.mjs';
import {
  normalizeMeetings,
  normalizeMechanisms,
  normalizeChurnEvents,
  buildTransferIndex,
  buildClientsMap,
} from './milestone-source-loader.mjs';

const NPS_CATEGORIES = ['Promotor', 'Neutro', 'Detrator'];

function normProgram(p) {
  return (p ?? '').trim().toUpperCase();
}

export function countMeetingsStrictlyBetween(meetings, clientId, afterExclusive, onOrBefore) {
  if (!meetings?.length) return null;
  let n = 0;
  for (const m of meetings) {
    if (m.client_id !== clientId) continue;
    if (isStrictlyBetween(m.start_time, afterExclusive, onOrBefore)) n++;
  }
  return n;
}

export function countMechanismsStrictlyBetween(mechanisms, clientId, afterExclusive, onOrBefore) {
  if (!mechanisms?.length) return null;
  let n = 0;
  for (const m of mechanisms) {
    if (m.client_id !== clientId || !m.has_implemented_at) continue;
    if (isStrictlyBetween(m.implemented_at, afterExclusive, onOrBefore)) n++;
  }
  return n;
}

function meetingStats(meetings, clientId, submittedAt) {
  const ts = parseTs(submittedAt);
  if (ts == null) {
    return {
      meetings_count_before_response: null,
      meetings_last_30d: null,
      meetings_last_90d: null,
      days_since_last_meeting: null,
      meetings_quality: 'unavailable',
    };
  }
  if (!meetings?.length) {
    return {
      meetings_count_before_response: null,
      meetings_last_30d: null,
      meetings_last_90d: null,
      days_since_last_meeting: null,
      meetings_quality: 'unavailable',
    };
  }
  const rows = meetings.filter(
    (m) => m.client_id === clientId && isOnOrBefore(m.start_time, submittedAt),
  );
  const t30 = ts - 30 * 86400000;
  const t90 = ts - 90 * 86400000;
  let last30 = 0;
  let last90 = 0;
  for (const m of rows) {
    const t = parseTs(m.start_time);
    if (t == null) continue;
    if (t >= t30) last30++;
    if (t >= t90) last90++;
  }
  const sorted = [...rows].sort((a, b) => parseTs(b.start_time) - parseTs(a.start_time));
  const daysSince = sorted[0] ? daysBetween(sorted[0].start_time, submittedAt) : null;
  return {
    meetings_count_before_response: rows.length,
    meetings_last_30d: last30,
    meetings_last_90d: last90,
    days_since_last_meeting: daysSince,
    meetings_quality: 'point_in_time',
  };
}

function mechanismStats(mecs, clientId, submittedAt) {
  if (!mecs?.length) {
    return {
      has_mechanism_before_response: null,
      mechanisms_count_before_response: null,
      mechanisms_quality: 'unavailable',
    };
  }
  const withDate = mecs.filter((m) => m.client_id === clientId && m.has_implemented_at);
  const counted = withDate.filter((m) => isOnOrBefore(m.implemented_at, submittedAt));
  const withoutDate = mecs.filter((m) => m.client_id === clientId && !m.has_implemented_at);
  if (withoutDate.length && !withDate.length) {
    return {
      has_mechanism_before_response: null,
      mechanisms_count_before_response: null,
      mechanisms_quality: 'partial',
    };
  }
  return {
    has_mechanism_before_response: counted.length > 0,
    mechanisms_count_before_response: counted.length,
    mechanisms_quality: withDate.length ? 'point_in_time' : 'unavailable',
  };
}

function epStatsBefore(transfers, clientId, submittedAt) {
  const list = transfers.get(clientId) ?? [];
  const before = list.filter((t) => isOnOrBefore(t.created_at, submittedAt));
  return {
    ever_changed_ep_before_response: before.length > 0,
    ep_changes_before_response: before.length,
    ep_quality: list.length ? 'point_in_time' : 'unavailable',
  };
}

function epBetweenResponses(transfers, clientId, prevSubmittedAt, currSubmittedAt) {
  const list = transfers.get(clientId) ?? [];
  const between = list.filter((t) => isStrictlyBetween(t.created_at, prevSubmittedAt, currSubmittedAt));
  return {
    changed_ep_since_previous_response: between.length > 0,
    ep_changes_since_previous_response: between.length,
  };
}

function freezeEffectiveAt(row) {
  return (
    row.effective_at ??
    row.data_efetiva ??
    row.data_inicio_congelamento ??
    row.reviewed_at ??
    row.created_at
  );
}

function isFreezeActiveState(row) {
  const s = `${row.tipo ?? ''} ${row.request_type ?? ''} ${row.status ?? ''} ${row.type ?? ''}`.toLowerCase();
  if (s.includes('descongel') || s.includes('unfreeze') || s.includes('ativo')) return false;
  return s.includes('congel') || s.includes('freeze');
}

function freezeStatsFromHistory(clientId, submittedAt, freezeRows) {
  const rows = (freezeRows ?? [])
    .filter(
      (r) =>
        r.client_id === clientId &&
        isOnOrBefore(freezeEffectiveAt(r), submittedAt),
    )
    .sort((a, b) => parseTs(freezeEffectiveAt(b)) - parseTs(freezeEffectiveAt(a)));
  if (!rows.length) return null;
  const last = rows[0];
  return {
    ever_frozen_before_response: true,
    frozen_at_response: isFreezeActiveState(last),
    freeze_quality: 'point_in_time',
  };
}

function freezeStats(client, submittedAt, freezeRows = []) {
  const fromHistory = freezeStatsFromHistory(client?.id, submittedAt, freezeRows);
  if (fromHistory) return fromHistory;

  const cong = client?.data_congelamento ?? client?.data_congelamento_at;
  const descong = client?.data_descongelamento ?? client?.data_descongelamento_at;
  const status = (client?.status ?? '').toLowerCase();

  if (cong && isOnOrBefore(cong, submittedAt)) {
    const stillFrozen = !descong || !isOnOrBefore(descong, submittedAt) || parseTs(descong) > parseTs(submittedAt);
    if (stillFrozen) {
      return {
        ever_frozen_before_response: true,
        frozen_at_response: true,
        freeze_quality: 'point_in_time',
      };
    }
    return {
      ever_frozen_before_response: true,
      frozen_at_response: false,
      freeze_quality: 'point_in_time',
    };
  }

  if (status.includes('congel')) {
    return {
      ever_frozen_before_response: null,
      frozen_at_response: status.includes('congel'),
      freeze_quality: 'current_proxy',
    };
  }

  return {
    ever_frozen_before_response: false,
    frozen_at_response: false,
    freeze_quality: cong ? 'partial' : 'current_proxy',
  };
}

function churnStats(churnEvents, clientId, submittedAt) {
  if (!churnEvents?.length) {
    return {
      churn_requested_before_response: null,
      churn_requests_before_response: null,
      churn_quality: 'unavailable',
    };
  }
  const rows = churnEvents.filter(
    (e) => e.client_id === clientId && isOnOrBefore(e.event_at, submittedAt),
  );
  return {
    churn_requested_before_response: rows.length > 0,
    churn_requests_before_response: rows.length,
    churn_quality: 'point_in_time',
  };
}

function engagementAt(submittedAt, client, history) {
  if (history?.length) {
    const ts = parseTs(submittedAt);
    const sorted = [...history]
      .filter((h) => h.client_id && parseTs(h.created_at ?? h.effective_at ?? h.recorded_at) != null)
      .sort(
        (a, b) =>
          parseTs(b.created_at ?? b.effective_at ?? b.recorded_at) -
          parseTs(a.created_at ?? a.effective_at ?? a.recorded_at),
      );
    for (const h of sorted) {
      const at = parseTs(h.created_at ?? h.effective_at ?? h.recorded_at);
      if (at != null && at <= ts) {
        return {
          engagement_at_response:
            h.new_value ?? h.status ?? h.engagement ?? h.engajamento ?? h.old_value ?? null,
          engagement_quality: 'point_in_time',
        };
      }
    }
    return { engagement_at_response: null, engagement_quality: 'unavailable' };
  }
  const snap = client?.engajamento ?? client?.engagement_status ?? null;
  if (snap) {
    return { engagement_at_response: snap, engagement_quality: 'current_proxy' };
  }
  return { engagement_at_response: null, engagement_quality: 'unavailable' };
}

function appAccess(client) {
  const v = client?.app_pharus_access ?? client?.has_app_pharus ?? null;
  if (v == null) return { app_pharus_access: null, app_quality: 'unavailable' };
  return { app_pharus_access: Boolean(v), app_quality: 'current_proxy' };
}

function journeyFields(response, clientJourneys, stageNames) {
  if (response.journey_stage) {
    return {
      journey_stage: response.journey_stage,
      journey_stage_quality: 'current_proxy',
    };
  }
  const cj = clientJourneys instanceof Map ? clientJourneys.get(response.client_id) : null;
  const stageId = cj?.current_stage_id;
  const name = stageId ? stageNames.get(stageId) : null;
  return {
    journey_stage: name ?? null,
    journey_stage_quality: name ? 'current_proxy' : 'unavailable',
  };
}

/**
 * @param {Array<object>} responses PHARUS deduplicadas processadas
 * @param {object} sourceBundle { loaded, meetings, mechanisms, churn, transfers, clientsMap, clientJourneys, stageNames }
 */
export function buildNpsClientMilestones(responses, sourceBundle = {}) {
  const {
    meetings = [],
    mechanisms = [],
    churnEvents = [],
    transfers = new Map(),
    clientsMap = new Map(),
    clientJourneys = new Map(),
    stageNames = new Map(),
    engagementHistory = [],
    freezeEvents = [],
  } = sourceBundle;

  const byClientCycle = new Map();
  const byResponseId = new Map();
  for (const r of responses ?? []) {
    if (r.response_id) byResponseId.set(r.response_id, r);
  }
  const entries = [];

  for (const r of responses ?? []) {
    if (normProgram(r.program) !== 'PHARUS') continue;
    if (!isValidScore(r.score)) continue;
    if (!r.client_id || !r.analytical_cycle_code) continue;

    const submittedAt = r.submitted_at;
    const client = clientsMap.get(r.client_id);
    const meet = meetingStats(meetings, r.client_id, submittedAt);
    const mech = mechanismStats(mechanisms, r.client_id, submittedAt);
    const ep = epStatsBefore(transfers, r.client_id, submittedAt);
    const fr = freezeStats(client, submittedAt, freezeEvents);
    const churn = churnStats(churnEvents, r.client_id, submittedAt);
    const eng = engagementAt(
      submittedAt,
      client,
      engagementHistory.filter((h) => h.client_id === r.client_id),
    );
    const app = appAccess(client);
    const journey = journeyFields(r, clientJourneys, stageNames);

    const tenureDays =
      client?.data_inicio_ciclo && submittedAt
        ? daysBetween(client.data_inicio_ciclo, submittedAt)
        : null;

    let betweenPrev = {
      changed_ep_since_previous_response: null,
      ep_changes_since_previous_response: null,
    };
    if (r.previous_score != null && r.previous_response_id) {
      const prev = byResponseId.get(r.previous_response_id);
      if (prev?.submitted_at) {
        betweenPrev = epBetweenResponses(transfers, r.client_id, prev.submitted_at, submittedAt);
      }
    }

    const row = {
      client_id: r.client_id,
      client_name: r.client_name,
      client_code: r.client_code,
      analytical_cycle_code: r.analytical_cycle_code,
      submitted_at: submittedAt,
      score: r.score,
      nps_category: r.nps_category ?? classifyNpsScore(r.score),
      previous_score: r.previous_score ?? null,
      previous_category: r.previous_category ?? null,
      score_delta: r.score_delta ?? null,
      migration: r.nps_migration ?? null,
      evolution_status: r.evolution_status ?? null,
      ep_id: r.ep_id ?? null,
      ep_name: r.ep_name ?? null,
      ep_resolution_confidence: r.ep_resolution_confidence ?? null,
      tenure_days: tenureDays,
      tenure_months: tenureDays != null ? tenureDays / 30.44 : null,
      journey_stage: journey.journey_stage,
      ...meet,
      ...mech,
      ...betweenPrev,
      ...ep,
      ...fr,
      ...churn,
      engagement_at_response: eng.engagement_at_response,
      engagement_quality: eng.engagement_quality,
      app_pharus_access: app.app_pharus_access,
      app_quality: app.app_quality,
      field_quality: {
        meetings: meet.meetings_quality,
        mechanisms: mech.mechanisms_quality,
        ep: ep.ep_quality,
        freeze: fr.freeze_quality,
        churn: churn.churn_quality,
        journey: journey.journey_stage_quality,
        engagement: eng.engagement_quality,
        app: app.app_quality,
      },
    };

    entries.push(row);
    byClientCycle.set(`${r.client_id}::${r.analytical_cycle_code}`, row);
  }

  return { entries, byClientCycle };
}

function categoryBucket(rows, cycleCode, category) {
  return rows.filter(
    (r) => r.analytical_cycle_code === cycleCode && r.nps_category === category,
  );
}

function summarizeCategory(rows) {
  const meetings = rows.map((r) => r.meetings_count_before_response).filter((v) => v != null);
  const daysSince = rows.map((r) => r.days_since_last_meeting).filter((v) => v != null);
  const engagement = {};
  for (const r of rows) {
    const e = r.engagement_at_response ?? '(sem dado)';
    engagement[e] = (engagement[e] ?? 0) + 1;
  }
  const journey = {};
  for (const r of rows) {
    const j = r.journey_stage ?? '(sem dado)';
    journey[j] = (journey[j] ?? 0) + 1;
  }
  return {
    n: rows.length,
    meetings_mean: mean(meetings),
    meetings_median: median(meetings),
    days_since_last_meeting_mean: mean(daysSince),
    days_since_last_meeting_median: median(daysSince),
    pct_has_mechanism: pctTrue(rows, (r) => r.has_mechanism_before_response === true),
    pct_2plus_mechanisms: pctTrue(
      rows,
      (r) => (r.mechanisms_count_before_response ?? 0) >= 2,
    ),
    pct_changed_ep: pctTrue(rows, (r) => r.changed_ep_since_previous_response === true),
    pct_ever_changed_ep: pctTrue(rows, (r) => r.ever_changed_ep_before_response === true),
    pct_ever_frozen: pctTrue(rows, (r) => r.ever_frozen_before_response === true),
    pct_frozen_at_response: pctTrue(rows, (r) => r.frozen_at_response === true),
    pct_churn_requested: pctTrue(rows, (r) => r.churn_requested_before_response === true),
    pct_app_access: pctTrue(rows, (r) => r.app_pharus_access === true),
    engagement_distribution: engagement,
    journey_stage_distribution: journey,
  };
}

const MATRIX_ROWS = [
  { key: 'has_mechanism', label: 'Tem mecanismo (até a resposta)', field: 'has_mechanism_before_response' },
  { key: 'mechanisms_2plus', label: '2+ mecanismos', minCount: 2 },
  { key: 'ever_changed_ep', label: 'Já trocou de EP', field: 'ever_changed_ep_before_response' },
  { key: 'changed_ep_since_prev', label: 'Trocou EP desde resposta anterior', field: 'changed_ep_since_previous_response' },
  { key: 'ever_frozen', label: 'Já congelou', field: 'ever_frozen_before_response' },
  { key: 'frozen_now', label: 'Estava congelado na resposta', field: 'frozen_at_response' },
  { key: 'churn_requested', label: 'Já solicitou churn', field: 'churn_requested_before_response' },
  { key: 'app_access', label: 'Usa App PHARUS (proxy)', field: 'app_pharus_access' },
];

function matrixCell(rows, spec) {
  if (spec.minCount != null) {
    const n = rows.filter((r) => (r.mechanisms_count_before_response ?? 0) >= spec.minCount).length;
    return { n, pct: rows.length ? (n / rows.length) * 100 : null };
  }
  const n = rows.filter((r) => r[spec.field] === true).length;
  return { n, pct: rows.length ? (n / rows.length) * 100 : null };
}

export function buildNpsMilestonesSummary(entries, cycleCodes) {
  const cycles = [];
  for (const cycleCode of cycleCodes) {
    const categories = {};
    const matrix = [];
    for (const cat of NPS_CATEGORIES) {
      categories[cat] = summarizeCategory(categoryBucket(entries, cycleCode, cat));
    }
    for (const spec of MATRIX_ROWS) {
      const row = { milestone_key: spec.key, label: spec.label, categories: {} };
      for (const cat of NPS_CATEGORIES) {
        const bucket = categoryBucket(entries, cycleCode, cat);
        row.categories[cat] = matrixCell(bucket, spec);
      }
      matrix.push(row);
    }
    const meetingsRow = {
      milestone_key: 'meetings_stats',
      label: 'Reuniões (até a resposta)',
      categories: {},
    };
    for (const cat of NPS_CATEGORIES) {
      const s = categories[cat];
      meetingsRow.categories[cat] = {
        mean: s.meetings_mean,
        median: s.meetings_median,
        days_since_mean: s.days_since_last_meeting_mean,
        days_since_median: s.days_since_last_meeting_median,
      };
    }
    matrix.push(meetingsRow);

    cycles.push({ analytical_cycle_code: cycleCode, categories, milestone_matrix: matrix });
  }
  return { cycles };
}

export function buildBetweenCycleEvents(entries, pairedDoc) {
  const out = [];
  const byClient = new Map();
  for (const e of entries) {
    if (!byClient.has(e.client_id)) byClient.set(e.client_id, []);
    byClient.get(e.client_id).push(e);
  }

  for (const [clientId, rows] of byClient) {
    const sorted = [...rows].sort((a, b) => parseTs(a.submitted_at) - parseTs(b.submitted_at));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.analytical_cycle_code === curr.analytical_cycle_code) continue;
      const daysBetweenResponses = daysBetween(prev.submitted_at, curr.submitted_at);
      out.push({
        client_id: clientId,
        client_name: curr.client_name,
        previous_cycle: prev.analytical_cycle_code,
        current_cycle: curr.analytical_cycle_code,
        previous_score: prev.score,
        current_score: curr.score,
        migration: curr.migration,
        ep_changed: curr.changed_ep_since_previous_response ?? false,
        ep_changes: curr.ep_changes_since_previous_response ?? 0,
        mechanisms_added: null,
        mechanism_implemented: null,
        freeze_started: null,
        freeze_ended: null,
        churn_requested: null,
        meetings_between: null,
        days_between_responses: daysBetweenResponses,
        previous_submitted_at: prev.submitted_at,
        current_submitted_at: curr.submitted_at,
        ep_name_previous: prev.ep_name,
        ep_name_current: curr.ep_name,
      });
    }
  }

  if (pairedDoc?.current_cycle) {
    return out.filter(
      (r) =>
        r.current_cycle === pairedDoc.current_cycle &&
        (pairedDoc.paired_client_ids ?? []).includes(r.client_id),
    );
  }
  return out;
}

export function buildMilestoneCoverage(entries) {
  const n = entries.length || 1;
  const fieldQuality = {};
  const countQuality = (path) => {
    let pit = 0;
    let proxy = 0;
    for (const e of entries) {
      const q = e.field_quality?.[path];
      if (q === 'point_in_time' || q === 'partial') pit++;
      if (q === 'current_proxy') proxy++;
    }
    return {
      coverage_pct: ((pit + proxy) / n) * 100,
      point_in_time_pct: (pit / n) * 100,
      current_proxy_pct: (proxy / n) * 100,
    };
  };
  for (const k of ['meetings', 'mechanisms', 'ep', 'freeze', 'churn', 'journey', 'engagement', 'app']) {
    fieldQuality[k] = countQuality(k);
  }
  return fieldQuality;
}

export function prepareSourceBundle(loaded) {
  const meetings = normalizeMeetings(loaded);
  const mechanisms = normalizeMechanisms(loaded);
  const churnEvents = normalizeChurnEvents(loaded);
  const transfers = buildTransferIndex(loaded);
  const clientsMap = buildClientsMap(loaded);
  const clientJourneys = new Map(
    (loaded['client_journeys.json'] ?? []).map((j) => [j.client_id, j]),
  );
  const stageNames = new Map(
    (loaded['journey_stages.json'] ?? []).map((s) => [s.id, s.name ?? s.id]),
  );
  const engagementHistory = loaded['client_engajamento_history.json'] ?? [];
  const freezeEvents = (loaded['freeze_change_requests.json'] ?? []).filter((r) => r.client_id);
  return {
    loaded,
    meetings,
    mechanisms,
    churnEvents,
    transfers,
    clientsMap,
    clientJourneys,
    stageNames,
    engagementHistory,
    freezeEvents,
  };
}
