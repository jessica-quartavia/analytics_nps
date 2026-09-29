import {
  loadAnalyticalCycleConfig,
  resolveAnalyticalCycleForResponse,
  dedupeByClientAndAnalyticalCycle,
  matchesAnalyticalCycle,
  resolveCycleBounds,
  operationalCycleStatus,
} from '../analytics/analytical-cycles.mjs';
import { resolveEpAtDate } from '../analytics/ep-history.mjs';
import { classifyNpsScore, isValidScore } from '../analytics/nps.mjs';

/**
 * @param {string} sourceCycleId
 * @param {object} client
 * @param {object[]} analyticalConfig
 */
export function analyticalCyclesForSourceSend(sourceCycleId, client, analyticalConfig) {
  if (client?.programa !== 'PHARUS') return [];
  const codes = [];
  for (const def of analyticalConfig) {
    if (!def.source_cycle_ids?.includes(sourceCycleId)) continue;
    codes.push(def.cycle_code);
  }
  return [...new Set(codes)];
}

/**
 * @param {object[]} sourceCyclesFromDb
 * @param {object[]} analyticalConfig
 */
export function buildAnalyticalCyclesCatalog(sourceCyclesFromDb, analyticalConfig) {
  return analyticalConfig.map((def) => {
    const bounds = resolveCycleBounds(def, sourceCyclesFromDb);
    const status = operationalCycleStatus(def, bounds);
    return {
      cycle_code: def.cycle_code,
      cycle_name: def.cycle_name,
      program: def.program,
      type: def.type,
      sequence: def.sequence ?? null,
      starts_at: bounds.starts_at,
      ends_at: bounds.ends_at,
      source_cycle_ids: def.source_cycle_ids ?? [],
      source_cycle_names: def.source_cycle_names ?? [],
      resolution_method: def.resolution_method,
      status,
      historical_expected_responses: def.historical_expected_responses ?? null,
      reconstruction_status: def.reconstruction_status ?? null,
      reconstruction_confidence: def.reconstruction_confidence ?? null,
    };
  });
}

export function buildAnalyticalResponsesFromSource(ctx) {
  const {
    sourceRows,
    analyticalConfig,
    sourceCyclesFromDb,
    clientsMap,
    journeyMap,
    transferMap,
    epNameToId,
    refreshRunId,
  } = ctx;

  const qualityEntries = [];
  const unresolvedRows = [];
  const staged = [];

  for (const src of sourceRows) {
    if (!isValidScore(src.score)) {
      qualityEntries.push({
        refresh_run_id: refreshRunId,
        severity: 'error',
        check_name: 'invalid_score',
        client_id: src.client_id,
        source_record_id: src.id,
        message: `Score inválido: ${src.score}`,
      });
      continue;
    }

    if (!src.client_id) {
      qualityEntries.push({
        refresh_run_id: refreshRunId,
        severity: 'warning',
        check_name: 'client_not_found',
        source_record_id: src.id,
        message: 'Resposta sem client_id',
      });
      continue;
    }

    const client = clientsMap.get(src.client_id);
    if (!client) {
      qualityEntries.push({
        refresh_run_id: refreshRunId,
        severity: 'warning',
        check_name: 'client_not_found',
        client_id: src.client_id,
        source_record_id: src.id,
        message: 'Cliente não encontrado no BASE QV',
      });
      continue;
    }

    const matchingDefs = analyticalConfig.filter((def) =>
      matchesAnalyticalCycle(src, client, def, sourceCyclesFromDb),
    );

    if (matchingDefs.length > 1) {
      qualityEntries.push({
        refresh_run_id: refreshRunId,
        severity: 'warning',
        check_name: 'source_analytical_cycle_conflict',
        client_id: src.client_id,
        source_record_id: src.id,
        message: 'Resposta compatível com mais de um ciclo analítico',
        details: { cycles: matchingDefs.map((d) => d.cycle_code) },
      });
    }

    const assignment = resolveAnalyticalCycleForResponse(
      src,
      client,
      analyticalConfig,
      sourceCyclesFromDb,
    );

    if (!assignment) {
      unresolvedRows.push({
        source_response_id: src.id,
        client_id: src.client_id,
        submitted_at: src.submitted_at,
        score: src.score,
        program: client.programa,
      });
      qualityEntries.push({
        refresh_run_id: refreshRunId,
        severity: 'info',
        check_name: 'analytical_cycle_unresolved',
        client_id: src.client_id,
        source_record_id: src.id,
        message: 'Resposta fora dos ciclos analíticos aprovados',
        details: {
          submitted_at: src.submitted_at,
          program: client.programa,
        },
      });
      continue;
    }

    const ep = resolveEpAtDate({
      clientId: src.client_id,
      responseDate: src.submitted_at,
      currentEpName: client?.engenheiro_patrimonial ?? null,
      transferLogs: transferMap.get(src.client_id) ?? [],
      previousFromJson: Array.isArray(client?.engenheiros_anteriores)
        ? client.engenheiros_anteriores
        : [],
      epNameToId,
    });

    if (ep.resolution_method === 'current_proxy') {
      qualityEntries.push({
        refresh_run_id: refreshRunId,
        severity: 'warning',
        check_name: 'ep_current_proxy',
        client_id: src.client_id,
        source_record_id: src.id,
        message: 'EP resolvido via proxy atual (baixa confiança)',
        details: { ep_name: ep.ep_name },
      });
    }

    if (assignment.legacy_payload_missing) {
      qualityEntries.push({
        refresh_run_id: refreshRunId,
        severity: 'info',
        check_name: 'legacy_payload_missing',
        client_id: src.client_id,
        source_record_id: src.id,
        analytical_cycle_code: assignment.analytical_cycle_code,
        message: 'raw_payload ausente (legacy)',
      });
    }

    staged.push({
      response_id: src.id,
      source_response_id: src.id,
      typeform_response_id: src.typeform_response_id ?? null,
      client_id: src.client_id,
      client_code: client?.codigo ?? null,
      client_name: src.client_name ?? client?.name ?? null,
      analytical_cycle_code: assignment.analytical_cycle_code,
      analytical_cycle_name: assignment.analytical_cycle_name,
      source_cycle_id: assignment.source_cycle_id,
      source_cycle_name: assignment.source_cycle_name,
      cycle_resolution_method: assignment.cycle_resolution_method,
      legacy_payload_missing: assignment.legacy_payload_missing,
      submitted_at: src.submitted_at,
      score: src.score,
      nps_category: classifyNpsScore(src.score),
      comment: src.comment ?? null,
      program: client?.programa ?? null,
      segment: client?.segmentacao ?? null,
      journey_stage: journeyMap.get(src.client_id) ?? null,
      ep_id: ep.ep_id,
      ep_name: ep.ep_name,
      ep_resolution_method: ep.resolution_method,
      ep_resolution_confidence: ep.confidence,
      raw_payload: src.raw_payload ?? null,
      source: 'BASE_QV',
    });
  }

  const { kept, removed } = dedupeByClientAndAnalyticalCycle(staged);
  for (const d of removed) {
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: 'info',
      check_name: 'duplicate_response',
      client_id: d.removed.client_id,
      source_record_id: d.removed.source_response_id,
      analytical_cycle_code: d.removed.analytical_cycle_code,
      message: 'Dedupe client_id + analytical_cycle — mantida resposta mais recente',
      details: {
        kept_source_response_id: d.kept.source_response_id,
        removed_source_response_id: d.removed.source_response_id,
        kept_submitted_at: d.kept.submitted_at,
        removed_submitted_at: d.removed.submitted_at,
      },
    });
  }

  return {
    responses: kept,
    unresolvedRows,
    qualityEntries,
    duplicate_count: removed.length,
    raw_staged_count: staged.length,
  };
}

export function buildAnalyticalEligibleClients(
  analyticalConfig,
  allSends,
  clientsMap,
  journeyMap,
  transferMap,
  epNameToId,
  responses,
) {
  const responseKey = new Map(
    responses
      .filter((r) => r.analytical_cycle_code && r.client_id)
      .map((r) => [`${r.analytical_cycle_code}::${r.client_id}`, r.response_id]),
  );

  const rows = [];
  for (const send of allSends) {
    const client = clientsMap.get(send.client_id);
    if (!client) continue;

    const analyticalCodes = analyticalCyclesForSourceSend(send.cycle_id, client, analyticalConfig);
    for (const analytical_cycle_code of analyticalCodes) {
      const def = analyticalConfig.find((c) => c.cycle_code === analytical_cycle_code);
      const ep = resolveEpAtDate({
        clientId: send.client_id,
        responseDate: send.sent_at,
        currentEpName: client?.engenheiro_patrimonial ?? null,
        transferLogs: transferMap.get(send.client_id) ?? [],
        previousFromJson: Array.isArray(client?.engenheiros_anteriores)
          ? client.engenheiros_anteriores
          : [],
        epNameToId,
      });
      const respId = responseKey.get(`${analytical_cycle_code}::${send.client_id}`) ?? null;
      rows.push({
        analytical_cycle_code,
        analytical_cycle_name: def?.cycle_name ?? null,
        source_cycle_id: send.cycle_id,
        client_id: send.client_id,
        client_code: client?.codigo ?? null,
        client_name: client?.name ?? null,
        ep_id: ep.ep_id,
        ep_name: ep.ep_name,
        program: client?.programa ?? null,
        segment: client?.segmentacao ?? null,
        journey_stage: journeyMap.get(send.client_id) ?? null,
        status: client?.status ?? null,
        sent_at: send.sent_at,
        responded: Boolean(respId),
        response_id: respId,
      });
    }
  }
  return rows;
}

export function computeEligibleMeta(analytical_cycle_code, cycleDef, eligibleRows, cycleResponses) {
  const eligible = eligibleRows.filter((e) => e.analytical_cycle_code === analytical_cycle_code);
  const responded = eligible.filter((e) => e.responded).length;

  if (cycleDef?.type === 'historical_reconstruction') {
    return {
      eligible_clients: eligible.length,
      response_rate: null,
      response_rate_quality: 'partial',
      note: 'Campanha reconstruída desde 2026-06-16; nps_sends não cobre necessariamente toda a janela.',
    };
  }

  if (!eligible.length) {
    return {
      eligible_clients: 0,
      response_rate: null,
      response_rate_quality: 'unavailable',
    };
  }

  const rate = responded / eligible.length;
  return {
    eligible_clients: eligible.length,
    response_rate: rate,
    response_rate_quality: cycleDef?.cycle_status === 'open' ? 'partial' : 'complete',
  };
}

export { loadAnalyticalCycleConfig };
