/**
 * Painel Projeção NPS — exclusivamente respostas BASE QV (responses.json).
 * Sem BASE0 / historical_nps_enriched / medições estáticas.
 */
import {
  aggregateNpsForAnalyticalCycle,
  aggregateNpsForOfficialSourceCycleWindow,
  classifyNpsScore,
  isValidScore,
  npsScoreFromRow,
  npsResponseTimestampMs,
} from './nps.mjs';
import {
  canonicalizeNpsCycle,
  cycleSortKey,
  nextCanonicalCycle,
} from './nps-cycle-canonical.mjs';

function parseDateOnly(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const t0 = Date.parse(`${a}T12:00:00Z`);
  const t1 = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return Math.round((t1 - t0) / 86400000);
}

function categoryLabel(score) {
  if (!isValidScore(score)) return null;
  return classifyNpsScore(Number(score));
}

function cycleCutoffDate(cycleDef) {
  return parseDateOnly(cycleDef.starts_at) ?? parseDateOnly(cycleDef.ends_at);
}

function officialAggForCycle(responses, cycleDef) {
  if (cycleDef.type === 'source_cycle') {
    return aggregateNpsForOfficialSourceCycleWindow(responses, {
      starts_at: cycleDef.starts_at ?? null,
      ends_at: cycleDef.ends_at ?? null,
    });
  }
  return aggregateNpsForAnalyticalCycle(responses, cycleDef.cycle_code, { program: 'PHARUS' });
}

function buildSnapshotFromHistory(priorRows, cutoff) {
  const scores = priorRows
    .map((r) => npsScoreFromRow(r))
    .filter((s) => isValidScore(s))
    .map(Number);
  if (!scores.length) {
    return {
      last_nps_score: null,
      avg_nps_score: null,
      prior_nps_count: 0,
      nps_score_delta: null,
      days_since_last_nps: null,
      meetings_before: 0,
      mechanisms_implemented: 0,
      has_implemented_mechanism: 0,
      ep_transfers_before: 0,
      payments_before: 0,
      amount_paid_before: 0,
      days_since_last_meeting: null,
      programa: priorRows.at(-1)?.program ?? 'PHARUS',
      safra_trimestre: 'Não informado',
      tenure_bucket: priorRows.at(-1)?.journey_stage ?? 'Não informado',
    };
  }
  const last = scores[scores.length - 1];
  const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  const lastRow = priorRows[priorRows.length - 1];
  const lastDate = parseDateOnly(lastRow.submitted_at);
  return {
    last_nps_score: last,
    avg_nps_score: avg,
    prior_nps_count: scores.length,
    nps_score_delta:
      scores.length >= 2
        ? Math.round((scores[scores.length - 1] - scores[scores.length - 2]) * 10) / 10
        : null,
    days_since_last_nps: lastDate ? daysBetween(lastDate, cutoff) : null,
    meetings_before: 0,
    mechanisms_implemented: 0,
    has_implemented_mechanism: 0,
    ep_transfers_before: 0,
    payments_before: 0,
    amount_paid_before: 0,
    days_since_last_meeting: null,
    programa: lastRow.program ?? 'PHARUS',
    safra_trimestre: 'Não informado',
    tenure_bucket: lastRow.journey_stage ?? 'Não informado',
  };
}

function rowFeatures(snap, cutoff) {
  const priorCount = snap.prior_nps_count ?? 0;
  const last = snap.last_nps_score;
  const avg = snap.avg_nps_score;
  const recentDeterioration =
    last != null && avg != null ? Math.round((Number(last) - Number(avg)) * 100) / 100 : null;
  const engagementRaw =
    (snap.meetings_before ?? 0) * 0.25 + (snap.mechanisms_implemented ?? 0) * 0.35;
  return {
    months_since_entry: null,
    cliente_ativo: 1,
    has_app_access: null,
    prior_nps_count: priorCount,
    last_nps_score: last,
    avg_nps_score: avg,
    nps_score_delta: snap.nps_score_delta,
    recent_nps_change: snap.nps_score_delta,
    days_since_last_nps: snap.days_since_last_nps,
    meetings_before: snap.meetings_before ?? 0,
    mechanisms_implemented: snap.mechanisms_implemented ?? 0,
    has_implemented_mechanism: snap.has_implemented_mechanism ?? 0,
    ep_transfers_before: snap.ep_transfers_before ?? 0,
    payments_before: snap.payments_before ?? 0,
    amount_paid_before: snap.amount_paid_before ?? 0,
    days_since_last_meeting: snap.days_since_last_meeting,
    recent_deterioration: recentDeterioration,
    stability_score: null,
    engagement_score: Math.round(engagementRaw * 100) / 100,
    response_propensity_history:
      priorCount > 0 ? Math.min(1, priorCount / Math.max(priorCount + 1, 3)) : 0,
    missing_last_nps: last == null ? 1 : 0,
    missing_days_since_last_nps: snap.days_since_last_nps == null ? 1 : 0,
    missing_days_since_last_meeting: 1,
    programa: snap.programa ?? 'PHARUS',
    safra_trimestre: snap.safra_trimestre ?? 'Não informado',
    tenure_bucket: snap.tenure_bucket ?? 'Não informado',
  };
}

/** Última resposta válida por cliente dentro do ciclo analítico. */
function responseByClientInCycle(responses, cycleCode) {
  const byClient = new Map();
  for (const r of responses) {
    if (r.analytical_cycle_code !== cycleCode) continue;
    const score = npsScoreFromRow(r);
    if (score == null) continue;
    const cid = r.client_id;
    if (!cid) continue;
    const prev = byClient.get(cid);
    const t = npsResponseTimestampMs(r);
    if (!prev || t >= prev._t) {
      byClient.set(cid, { row: r, score, category: r.nps_category ?? categoryLabel(score), _t: t });
    }
  }
  return byClient;
}

/**
 * @param {object} input
 * @returns {{ meta, cycles, rows, projection_universe }}
 */
export function buildNpsPredictionPanelFromBaseQv({
  responses = [],
  cycles = [],
  eligibleClients = [],
  asOfDate = null,
}) {
  const projectionCutoff = (asOfDate ?? new Date().toISOString()).slice(0, 10);
  const baseQvRows = (responses ?? []).filter(
    (r) => r.program === 'PHARUS' && (r.source === 'BASE_QV' || r.source == null),
  );

  const cycles2026 = [...(cycles ?? [])]
    .filter((c) => String(c.cycle_code ?? '').includes('2026'))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  const canonicalCycles = [
    ...new Set(cycles2026.map((c) => canonicalizeNpsCycle(c.cycle_code))),
  ].sort((a, b) => cycleSortKey(a) - cycleSortKey(b));

  const cycleDefByCanonical = new Map();
  for (const def of cycles2026) {
    cycleDefByCanonical.set(canonicalizeNpsCycle(def.cycle_code), def);
  }

  const responsesByClient = new Map();
  for (const r of baseQvRows) {
    if (!r.client_id) continue;
    if (!responsesByClient.has(r.client_id)) responsesByClient.set(r.client_id, []);
    responsesByClient.get(r.client_id).push(r);
  }
  for (const list of responsesByClient.values()) {
    list.sort((a, b) => npsResponseTimestampMs(a) - npsResponseTimestampMs(b));
  }

  const eligibleByAnalytical = new Map();
  for (const e of eligibleClients ?? []) {
    const code = e.analytical_cycle_code;
    if (!code) continue;
    if (!eligibleByAnalytical.has(code)) eligibleByAnalytical.set(code, new Set());
    if (e.client_id) eligibleByAnalytical.get(code).add(e.client_id);
  }

  const rows = [];
  for (const canon of canonicalCycles) {
    const cycleDef = cycleDefByCanonical.get(canon);
    if (!cycleDef) continue;
    const cutoff = cycleCutoffDate(cycleDef);
    if (!cutoff) continue;
    const cutoffMs = Date.parse(`${cutoff}T00:00:00Z`);
    const analyticalCode = cycleDef.cycle_code;
    const eligibleIds =
      eligibleByAnalytical.get(analyticalCode) ??
      new Set(
        baseQvRows
          .filter((r) => r.analytical_cycle_code === analyticalCode)
          .map((r) => r.client_id)
          .filter(Boolean),
      );

    const inCycle = responseByClientInCycle(baseQvRows, analyticalCode);

    for (const clientId of eligibleIds) {
      const hist = (responsesByClient.get(clientId) ?? []).filter(
        (r) => npsResponseTimestampMs(r) < cutoffMs && npsScoreFromRow(r) != null,
      );
      const snap = buildSnapshotFromHistory(hist, cutoff);
      const hit = inCycle.get(clientId);
      rows.push({
        cycle: canon,
        analytical_cycle_code: analyticalCode,
        cutoff,
        client_id: clientId,
        responded: hit ? 1 : 0,
        category: hit?.category ?? null,
        score: hit?.score ?? null,
        features: rowFeatures(snap, cutoff),
      });
    }
  }

  const lastOfficial = canonicalCycles[canonicalCycles.length - 1] ?? null;
  const lastDef = lastOfficial ? cycleDefByCanonical.get(lastOfficial) : null;
  const targetCycle = lastOfficial ? nextCanonicalCycle(lastOfficial) : null;

  let currentNpsSummary = null;
  if (lastDef) {
    const agg = officialAggForCycle(baseQvRows, lastDef);
    currentNpsSummary = {
      nps: agg.nps,
      average_score: agg.average_score,
      valid_responses: agg.responses,
      universe: lastDef.type === 'source_cycle'
        ? 'source_window_geral_dedupe_latest_per_client'
        : 'pharus_dedupe_within_analytical_cycle',
    };
  }

  const projection_universe = [];
  if (lastDef) {
    const eligibleSet =
      eligibleByAnalytical.get(lastDef.cycle_code) ??
      new Set(baseQvRows.map((r) => r.client_id).filter(Boolean));
    const cutoffMs = Date.parse(`${projectionCutoff}T23:59:59Z`);
    for (const clientId of eligibleSet) {
      const hist = (responsesByClient.get(clientId) ?? []).filter(
        (r) => npsResponseTimestampMs(r) <= cutoffMs && npsScoreFromRow(r) != null,
      );
      const snap = buildSnapshotFromHistory(hist, projectionCutoff);
      projection_universe.push({
        client_id: clientId,
        features: rowFeatures(snap, projectionCutoff),
      });
    }
  }

  const cyclesMeta = canonicalCycles.map((ciclo) => {
    const def = cycleDefByCanonical.get(ciclo);
    const agg = def ? officialAggForCycle(baseQvRows, def) : null;
    const cycleRows = rows.filter((r) => r.cycle === ciclo);
    return {
      ciclo,
      analytical_cycle_code: def?.cycle_code ?? null,
      cutoff: def ? cycleCutoffDate(def) : null,
      eligible_clients: cycleRows.length,
      responses: cycleRows.filter((r) => r.responded === 1).length,
      nps_official: agg?.nps ?? null,
      average_score: agg?.average_score ?? null,
    };
  });

  const trainingResponses = rows.filter((r) => r.responded === 1).length;

  return {
    meta: {
      generated_at: new Date().toISOString(),
      as_of: projectionCutoff,
      source: 'BASE_QV',
      training_window: '2026',
      training_start: canonicalCycles[0] ?? null,
      training_end: lastOfficial,
      target_cycle: targetCycle,
      last_official_cycle: lastOfficial,
      official_cycles: canonicalCycles,
      training_cycles: canonicalCycles,
      training_responses: trainingResponses,
      row_count: rows.length,
      current_nps: currentNpsSummary?.nps ?? null,
      current_nps_average_score: currentNpsSummary?.average_score ?? null,
      current_nps_valid_responses: currentNpsSummary?.valid_responses ?? null,
      current_nps_source: currentNpsSummary?.universe ?? null,
      current_nps_universe: currentNpsSummary?.universe ?? null,
      pit_rule:
        'Features apenas de respostas BASE QV com submitted_at antes do cutoff do ciclo; target NPS oficial por ciclo via kernel Executivo.',
      methodology_note:
        'A projeção utiliza exclusivamente dados de NPS da BASE QV, mesma fonte usada para o NPS atual do Executivo.',
      methodology_caveat:
        'Modelo exploratório — histórico 2026 ainda limitado para backtest robusto.',
    },
    cycles: cyclesMeta,
    rows,
    projection_universe,
  };
}
