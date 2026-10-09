/**
 * Painel cliente × ciclo para modelagem NPS (view-layer; PIT no cutoff do ciclo).
 */
import { HISTORICO_OFFICIAL_MEDICOES } from './customer-nps-cohorts.mjs';
import {
  canonicalizeNpsCycle,
  cycleSortKey,
  quarterStartIso,
  nextCanonicalCycle,
} from './nps-cycle-canonical.mjs';
import { isValidScore } from './nps.mjs';

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

function monthsSinceEntry(entryDate, cutoff) {
  const d = daysBetween(entryDate, cutoff);
  if (d == null || d < 0) return null;
  return Math.round((d / 30.44) * 10) / 10;
}

function categoryLabel(score) {
  if (!isValidScore(score)) return null;
  const s = Number(score);
  if (s >= 9) return 'Promotor';
  if (s >= 7) return 'Neutro';
  return 'Detrator';
}

function snapshotFromEnriched(row) {
  if (!row) return null;
  return {
    last_nps_score: row.score,
    avg_nps_score: row.score,
    prior_nps_count: 1,
    days_since_last_nps: 0,
    meetings_before: row.meetings_before_response ?? 0,
    mechanisms_implemented: row.implemented_mechanisms_before_response ?? 0,
    ep_transfers_before: row.ep_transfers_before_response ?? 0,
    payments_before: row.payments_before_response ?? 0,
    amount_paid_before: row.amount_paid_before_response ?? 0,
    days_since_last_meeting: row.days_since_last_meeting_at_response,
    has_implemented_mechanism: row.has_implemented_mechanism_at_response ? 1 : 0,
    tenure_bucket: row.tenure_bucket_at_response ?? 'Não informado',
    programa: row.programa ?? 'Não informado',
    safra_trimestre: row.safra_trimestre ?? 'Não informado',
  };
}

function mergeSnapshot(prev, row, cutoff) {
  const respDate = parseDateOnly(row.response_date);
  const base = snapshotFromEnriched(row);
  if (!prev) return base;
  const scores = [...(prev._scores ?? []), row.score].filter((s) => isValidScore(s));
  const avg =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + Number(b), 0) / scores.length) * 100) / 100
      : prev.avg_nps_score;
  const last = isValidScore(row.score) ? Number(row.score) : prev.last_nps_score;
  const daysSince = respDate ? daysBetween(respDate, cutoff) : prev.days_since_last_nps;
  return {
    last_nps_score: last,
    avg_nps_score: avg,
    prior_nps_count: scores.length,
    nps_score_delta:
      scores.length >= 2 ? Math.round((scores[scores.length - 1] - scores[scores.length - 2]) * 10) / 10 : null,
    days_since_last_nps: daysSince,
    meetings_before: base?.meetings_before ?? prev.meetings_before,
    mechanisms_implemented: base?.mechanisms_implemented ?? prev.mechanisms_implemented,
    ep_transfers_before: base?.ep_transfers_before ?? prev.ep_transfers_before,
    payments_before: base?.payments_before ?? prev.payments_before,
    amount_paid_before: base?.amount_paid_before ?? prev.amount_paid_before,
    days_since_last_meeting: base?.days_since_last_meeting ?? prev.days_since_last_meeting,
    has_implemented_mechanism: base?.has_implemented_mechanism ?? prev.has_implemented_mechanism,
    tenure_bucket: base?.tenure_bucket ?? prev.tenure_bucket,
    programa: base?.programa ?? prev.programa,
    safra_trimestre: base?.safra_trimestre ?? prev.safra_trimestre,
    _scores: scores,
  };
}

function emptySnapshot(cohort) {
  return {
    last_nps_score: cohort?.last_nps_score ?? null,
    avg_nps_score: cohort?.avg_nps_score ?? null,
    prior_nps_count: cohort?.nps_response_count ?? 0,
    nps_score_delta: cohort?.nps_score_delta ?? null,
    days_since_last_nps: cohort?.last_nps_at
      ? daysBetween(parseDateOnly(cohort.last_nps_at), cohort._cutoff)
      : null,
    meetings_before: 0,
    mechanisms_implemented: 0,
    ep_transfers_before: 0,
    payments_before: 0,
    amount_paid_before: 0,
    days_since_last_meeting: null,
    has_implemented_mechanism: 0,
    tenure_bucket: 'Não informado',
    programa: cohort?.programa ?? 'Não informado',
    safra_trimestre: cohort?.safra_trimestre ?? 'Não informado',
    _scores: [],
  };
}

function rowFeatures(cohort, snap, cutoff) {
  const entry = parseDateOnly(cohort.payment_entry_date ?? cohort.data_entrada);
  const priorCount = snap.prior_nps_count ?? 0;
  const last = snap.last_nps_score;
  const avg = snap.avg_nps_score;
  const recentDeterioration =
    last != null && avg != null && !Number.isNaN(Number(last)) && !Number.isNaN(Number(avg))
      ? Math.round((Number(last) - Number(avg)) * 100) / 100
      : null;
  const scores = snap._scores ?? [];
  let stabilityScore = null;
  if (scores.length >= 2) {
    const mean = scores.reduce((a, b) => a + Number(b), 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (Number(b) - mean) ** 2, 0) / scores.length;
    stabilityScore = Math.round(Math.sqrt(variance) * 100) / 100;
  }
  const engagementRaw =
    (snap.meetings_before ?? 0) * 0.25 +
    (snap.mechanisms_implemented ?? 0) * 0.35 +
    (snap.payments_before ?? 0) * 0.2 +
    (snap.days_since_last_meeting != null && snap.days_since_last_meeting <= 90 ? 1 : 0) * 0.2;
  return {
    months_since_entry: monthsSinceEntry(entry, cutoff),
    cliente_ativo: cohort.cliente_ativo === true ? 1 : cohort.cliente_ativo === false ? 0 : null,
    has_app_access:
      cohort.has_app_access === true ? 1 : cohort.has_app_access === false ? 0 : null,
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
    stability_score: stabilityScore,
    engagement_score: Math.round(engagementRaw * 100) / 100,
    response_propensity_history:
      priorCount > 0 ? Math.min(1, priorCount / Math.max(priorCount + 1, 3)) : 0,
    missing_last_nps: last == null ? 1 : 0,
    missing_days_since_last_nps: snap.days_since_last_nps == null ? 1 : 0,
    missing_days_since_last_meeting: snap.days_since_last_meeting == null ? 1 : 0,
    programa: snap.programa ?? cohort.programa ?? 'Não informado',
    safra_trimestre: snap.safra_trimestre ?? cohort.safra_trimestre ?? 'Não informado',
    tenure_bucket: snap.tenure_bucket ?? 'Não informado',
  };
}

/**
 * @param {object} input
 * @returns {{ meta, cycles, rows, projection_universe }}
 */
export function buildNpsPredictionPanel({
  enrichedResponses = [],
  cohorts = [],
  officialMedicoes = HISTORICO_OFFICIAL_MEDICOES,
  asOfDate = '2026-10-06',
}) {
  const officialCycles = [...officialMedicoes]
    .map((m) => m.ciclo)
    .sort((a, b) => cycleSortKey(a) - cycleSortKey(b));

  const responsesByClient = new Map();
  for (const r of enrichedResponses) {
    const cid = r.client_id;
    if (!cid) continue;
    if (!responsesByClient.has(cid)) responsesByClient.set(cid, []);
    responsesByClient.get(cid).push(r);
  }
  for (const list of responsesByClient.values()) {
    list.sort((a, b) =>
      String(a.response_date ?? '').localeCompare(String(b.response_date ?? '')),
    );
  }

  const respondedInCycle = new Map();
  for (const r of enrichedResponses) {
    const cycle = canonicalizeNpsCycle(r.nps_cycle);
    if (!officialCycles.includes(cycle)) continue;
    if (!isValidScore(r.score)) continue;
    const key = `${r.client_id}||${cycle}`;
    respondedInCycle.set(key, {
      score: Number(r.score),
      category: r.nps_category ?? categoryLabel(r.score),
    });
  }

  const cohortById = new Map(cohorts.map((c) => [c.client_id, c]));
  const rows = [];

  for (const cycle of officialCycles) {
    const cutoff = quarterStartIso(cycle);
    if (!cutoff) continue;

    for (const cohort of cohorts) {
      const entry = parseDateOnly(cohort.payment_entry_date ?? cohort.data_entrada);
      if (!entry || entry > cutoff) continue;

      const hist = responsesByClient.get(cohort.client_id) ?? [];
      let snap = null;
      for (const h of hist) {
        const d = parseDateOnly(h.response_date);
        const hCycle = canonicalizeNpsCycle(h.nps_cycle);
        if (d && d < cutoff && officialCycles.includes(hCycle)) {
          snap = mergeSnapshot(snap, h, cutoff);
        }
      }
      if (!snap) {
        snap = emptySnapshot({ ...cohort, _cutoff: cutoff });
      }
      const scoresForDerived = snap._scores ? [...snap._scores] : [];
      if (snap._scores) delete snap._scores;
      snap._scores = scoresForDerived;

      const respKey = `${cohort.client_id}||${cycle}`;
      const hit = respondedInCycle.get(respKey);
      rows.push({
        cycle,
        cutoff,
        client_id: cohort.client_id,
        responded: hit ? 1 : 0,
        category: hit?.category ?? null,
        score: hit?.score ?? null,
        features: (() => {
          const f = rowFeatures(cohort, snap, cutoff);
          delete f._scores;
          return f;
        })(),
      });
    }
  }

  const lastOfficial = officialCycles[officialCycles.length - 1];
  const targetCycle = nextCanonicalCycle(lastOfficial);
  const projectionCutoff = asOfDate.slice(0, 10);

  const projection_universe = [];
  for (const cohort of cohorts) {
    const entry = parseDateOnly(cohort.payment_entry_date ?? cohort.data_entrada);
    if (!entry || entry > projectionCutoff) continue;
    if (cohort.cliente_ativo === false) continue;

    const hist = responsesByClient.get(cohort.client_id) ?? [];
    let snap = null;
    for (const h of hist) {
      const d = parseDateOnly(h.response_date);
      if (d && d <= projectionCutoff) {
        snap = mergeSnapshot(snap, h, projectionCutoff);
      }
    }
    if (!snap) snap = emptySnapshot({ ...cohort, _cutoff: projectionCutoff });
    const projScores = snap._scores ? [...snap._scores] : [];
    if (snap._scores) delete snap._scores;
    snap._scores = projScores;

    projection_universe.push({
      client_id: cohort.client_id,
      features: rowFeatures(cohort, snap, projectionCutoff),
    });
  }

  const cyclesMeta = officialCycles.map((ciclo) => {
    const official = officialMedicoes.find((m) => m.ciclo === ciclo);
    const cycleRows = rows.filter((r) => r.cycle === ciclo);
    return {
      ciclo,
      cutoff: quarterStartIso(ciclo),
      eligible_clients: cycleRows.length,
      responses: cycleRows.filter((r) => r.responded === 1).length,
      nps_official: official?.nps ?? null,
    };
  });

  return {
    meta: {
      generated_at: new Date().toISOString(),
      as_of: projectionCutoff,
      target_cycle: targetCycle,
      last_official_cycle: lastOfficial,
      pit_rule: 'features from enriched responses with response_date < cycle cutoff; cohort entry <= cutoff',
      official_cycles: officialCycles,
      row_count: rows.length,
    },
    cycles: cyclesMeta,
    rows,
    projection_universe,
  };
}
