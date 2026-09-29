import { resolveEpAtDate } from './ep-history.mjs';
import { resolveCsatAnalyticalCycle } from './csat-cycle-resolution.mjs';
import {
  CSAT_FORM_TYPE,
  CSAT_SUMMARY_AGGREGATION,
  LEGACY_REFERENCE,
} from './csat-config.mjs';
import {
  isValidCsatScore,
  isCsatSatisfied,
  summarizeCsatScores,
  getSatisfiedRuleMeta,
} from './csat.mjs';
import { isValidScore } from './nps.mjs';

function pickSubmittedAt(row) {
  return row.submitted_at ?? row.created_at ?? null;
}

/**
 * @param {Array<object>} sourceRows — BASE QV csat_responses
 * @param {Map<string, object>} clientsMap
 * @param {Map<string, object>} epNameToId
 * @param {Map<string, Array>} transferMap
 * @param {Array<object>} analyticalConfig
 * @param {Array<object>} sourceCyclesFromDb
 */
export function buildCsatResponsesProcessed(
  sourceRows,
  clientsMap,
  epNameToId,
  transferMap,
  analyticalConfig,
  sourceCyclesFromDb,
  processedCyclesCatalog = null,
) {
  const out = [];
  const quality = [];

  for (const src of sourceRows ?? []) {
    if (src.tipo_de_forms !== CSAT_FORM_TYPE) continue;

    const client = src.client_id ? clientsMap.get(src.client_id) : null;
    if (src.client_id && !client) {
      quality.push({
        severity: 'warning',
        check_name: 'csat_client_not_found',
        source_record_id: src.id,
        message: `client_id ${src.client_id} não encontrado`,
      });
    }

    const score = src.score;
    if (!isValidCsatScore(score)) {
      quality.push({
        severity: 'warning',
        check_name: 'csat_invalid_score',
        source_record_id: src.id,
        message: `score CSAT inválido: ${score}`,
      });
      continue;
    }

    const submittedAt = pickSubmittedAt(src);
    const { analytical_cycle_code, cycle_resolution_method } = resolveCsatAnalyticalCycle(
      submittedAt,
      client,
      analyticalConfig,
      sourceCyclesFromDb,
      processedCyclesCatalog,
    );

    if (!analytical_cycle_code) {
      quality.push({
        severity: 'info',
        check_name: 'csat_cycle_unresolved',
        source_record_id: src.id,
        message: cycle_resolution_method,
      });
    }

    const epResolved = resolveEpAtDate({
      clientId: src.client_id,
      responseDate: submittedAt,
      currentEpName: client?.engenheiro_patrimonial ?? null,
      transferLogs: transferMap.get(src.client_id) ?? [],
      previousFromJson: client?.engenheiros_anteriores ?? [],
      epNameToId,
    });

    out.push({
      source_response_id: src.id,
      client_id: src.client_id ?? null,
      client_code: client?.codigo ?? null,
      client_name: client?.name ?? src.client_name ?? null,
      analytical_cycle_code,
      source_cycle_id: null,
      submitted_at: submittedAt,
      score,
      is_satisfied: isCsatSatisfied(score),
      ep_id: epResolved.ep_id ?? null,
      ep_name: epResolved.ep_name ?? null,
      program: client?.programa ?? null,
      cycle_resolution_method,
      operational_period: analytical_cycle_code ? null : 'unassigned',
    });
  }

  return { rows: out, quality };
}

export function buildCsatSummary(csatResponses, eligibleByCycle, dataCutoff) {
  const byCycle = new Map();
  const unassigned = [];

  for (const r of csatResponses) {
    if (!r.analytical_cycle_code) {
      unassigned.push(r);
      continue;
    }
    if (!byCycle.has(r.analytical_cycle_code)) byCycle.set(r.analytical_cycle_code, []);
    byCycle.get(r.analytical_cycle_code).push(r);
  }

  const cycles = [];
  for (const [code, rows] of byCycle) {
    const scores = rows.map((r) => r.score);
    const stats = summarizeCsatScores(scores);
    const distinctClients = new Set(rows.map((r) => r.client_id).filter(Boolean)).size;
    const elig = eligibleByCycle?.get(code) ?? null;

    cycles.push({
      analytical_cycle_code: code,
      valid_responses: stats.valid_responses,
      distinct_clients: distinctClients,
      average_score: stats.average_score,
      median_score: stats.median_score,
      satisfied_responses: stats.satisfied_responses,
      satisfied_pct: stats.satisfied_pct,
      eligible_clients: elig?.eligible_clients ?? null,
      response_rate: elig?.eligible_clients
        ? distinctClients / elig.eligible_clients
        : null,
      response_rate_quality: elig?.eligible_clients ? 'partial' : 'unavailable',
      score_distribution: stats.score_distribution,
      aggregation: CSAT_SUMMARY_AGGREGATION,
      satisfied_rule: getSatisfiedRuleMeta(),
      data_cutoff: dataCutoff,
    });
  }

  if (unassigned.length) {
    const scores = unassigned.map((r) => r.score);
    const stats = summarizeCsatScores(scores);
    cycles.push({
      analytical_cycle_code: null,
      operational_period: 'outside_or_unmapped',
      valid_responses: stats.valid_responses,
      distinct_clients: new Set(unassigned.map((r) => r.client_id).filter(Boolean)).size,
      average_score: stats.average_score,
      median_score: stats.median_score,
      satisfied_responses: stats.satisfied_responses,
      satisfied_pct: stats.satisfied_pct,
      eligible_clients: null,
      response_rate: null,
      response_rate_quality: 'unavailable',
      score_distribution: stats.score_distribution,
      aggregation: CSAT_SUMMARY_AGGREGATION,
      satisfied_rule: getSatisfiedRuleMeta(),
      data_cutoff: dataCutoff,
    });
  }

  return { cycles, satisfied_rule: getSatisfiedRuleMeta(), data_cutoff: dataCutoff };
}

export function buildClientSatisfactionSummary(csatResponses, npsResponses) {
  const byClient = new Map();

  for (const r of csatResponses) {
    if (!r.client_id) continue;
    if (!byClient.has(r.client_id)) {
      byClient.set(r.client_id, {
        client_id: r.client_id,
        client_name: r.client_name,
        ep_name: r.ep_name,
        csat_scores: [],
        csat_dates: [],
        nps_rows: [],
      });
    }
    const c = byClient.get(r.client_id);
    c.csat_scores.push(r.score);
    if (r.submitted_at) c.csat_dates.push(r.submitted_at);
    if (r.client_name) c.client_name = r.client_name;
    if (r.ep_name) c.ep_name = r.ep_name;
  }

  for (const r of npsResponses ?? []) {
    if (!r.client_id || !isValidScore(r.score)) continue;
    if (!byClient.has(r.client_id)) {
      byClient.set(r.client_id, {
        client_id: r.client_id,
        client_name: r.client_name,
        ep_name: r.ep_name,
        csat_scores: [],
        csat_dates: [],
        nps_rows: [],
      });
    }
    byClient.get(r.client_id).nps_rows.push(r);
  }

  const entries = [];
  for (const c of byClient.values()) {
    const npsSorted = [...c.nps_rows].sort(
      (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
    );
    const latestNps = npsSorted[0] ?? null;

    const csatSorted = c.csat_scores.length
      ? csatResponses
          .filter((x) => x.client_id === c.client_id && x.submitted_at)
          .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      : [];
    const latestCsat = csatSorted[0] ?? null;
    const csatAvg =
      c.csat_scores.length > 0
        ? c.csat_scores.reduce((a, b) => a + b, 0) / c.csat_scores.length
        : null;

    entries.push({
      client_id: c.client_id,
      client_name: c.client_name ?? null,
      ep_name: c.ep_name ?? null,
      latest_nps_score: latestNps?.score ?? null,
      latest_nps_date: latestNps?.submitted_at ?? null,
      nps_responses_count: c.nps_rows.length,
      csat_average: csatAvg,
      latest_csat_score: latestCsat?.score ?? null,
      latest_csat_date: latestCsat?.submitted_at ?? null,
      csat_responses_count: c.csat_scores.length,
      has_csat: c.csat_scores.length > 0,
      has_nps: c.nps_rows.length > 0,
    });
  }

  return { entries, note: 'Visão operacional por cliente; não usar para recalcular NPS por ciclo.' };
}

export function buildCsatLegacyReconciliation(csatResponses) {
  const rule = getSatisfiedRuleMeta();
  const valid = csatResponses.filter((r) => isValidCsatScore(r.score));
  const stats = summarizeCsatScores(valid.map((r) => r.score));
  const clients = new Set(valid.map((r) => r.client_id).filter(Boolean)).size;

  const candidates = [
    { id: 'score_gte_4', satisfied_pct: stats.satisfied_pct },
    {
      id: 'score_eq_5',
      satisfied_pct: valid.length
        ? (valid.filter((r) => r.score === 5).length / valid.length) * 100
        : null,
    },
    {
      id: 'latest_client_avg_gte_4',
      satisfied_pct: null,
    },
  ];

  const legacy = LEGACY_REFERENCE;
  const diffAvg = stats.average_score != null ? stats.average_score - legacy.csat_average : null;
  const diffSat = stats.satisfied_pct != null ? stats.satisfied_pct - legacy.satisfied_pct : null;

  const ambiguous = Math.abs(diffSat ?? 999) > 5;

  return {
    generated_at: new Date().toISOString(),
    rule_used: rule,
    period: 'all_csat_responses_pharus_processed',
    responses_found: valid.length,
    distinct_clients: clients,
    csat_average: stats.average_score,
    satisfied_pct: stats.satisfied_pct,
    legacy_reference: legacy,
    difference: {
      csat_average: diffAvg,
      satisfied_pct: diffSat,
    },
    legacy_reproduced: {
      average_close: diffAvg != null && Math.abs(diffAvg) <= 0.15,
      satisfied_close: diffSat != null && Math.abs(diffSat) <= 2,
    },
    candidates_tested: candidates,
    possible_causes: [
      'Legado usa trimestre latest e população mista (NPS+CSAT), não csat_responses isolado.',
      'csat_cycles/csat_sends vazios no BASE QV — sem janela oficial CSAT.',
      'Limiar de satisfeitos no legado não documentado na fonte (60,3% ≠ top-2 box ~92% nesta base).',
      'Média legado 4,8 próxima da média por cliente latest (~4,79) ou ciclo Jun–Set (~4,80).',
    ],
    csat_rule_ambiguous: ambiguous,
    check_name: ambiguous ? 'csat_rule_ambiguous' : 'csat_legacy_difference',
  };
}
