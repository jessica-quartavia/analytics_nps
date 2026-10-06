import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { classifyNpsScore, isValidScore } from '../analytics/nps.mjs';
import { resolveEpAtDate } from '../analytics/ep-history.mjs';
import {
  deriveHistoryFields,
  sortClientResponsesByAnalyticalSequence,
  isConsecutiveDetractor,
} from '../analytics/evolution.mjs';
import { computeCriticalFlag, isPromotorConsistent } from '../analytics/critical-flag.mjs';
import { computeActionPriority } from '../analytics/action-priority.mjs';
import { buildActionQueueEnriched } from '../analytics/action-queue-enriched.mjs';
import { buildExecutiveDiagnosis } from '../analytics/executive-diagnosis.mjs';
import {
  buildCycleSummaryEntry,
  verifyJunJulBaseline,
  validateRefreshInvariants,
} from '../analytics/cycle-summary.mjs';
import { buildMigrationMatrix } from '../analytics/migration-matrix.mjs';
import { buildNpsMilestoneArtifacts } from '../analytics/nps-milestones-pipeline.mjs';
import { buildPairedCycleMetrics, markPairedWithPrevious } from '../analytics/paired-cycles.mjs';
import { buildEpSummaryDocument, validateEpSummaryInvariants } from '../analytics/ep-summary.mjs';
import { buildVocArtifacts } from '../analytics/voc-pipeline.mjs';
import {
  buildCsatResponsesProcessed,
  buildCsatSummary,
  buildClientSatisfactionSummary,
  buildCsatLegacyReconciliation,
} from '../analytics/csat-pipeline.mjs';
import { buildDriversArtifacts } from '../analytics/drivers-pipeline.mjs';
import {
  writeJson,
  writeTable,
  writeRawSnapshot,
  formatRawSnapshotDir,
  readJson,
} from '../data/file-store.mjs';
import { loadMethodologyConfig } from '../ops/methodology.mjs';
import {
  confirmBaseQvReadOnly,
  createBaseQvClient,
  fetchNpsCycles,
  fetchNpsResponses,
  fetchNpsSends,
  fetchClientsByIds,
  fetchJourneyStagesByClientIds,
  fetchTransferLogsByClientIds,
  fetchEpDirectory,
  fetchTableAll,
  fetchCsatResponses,
} from '../data/base-qv.mjs';
import {
  fetchMilestoneSourcesBundle,
  pharusMilestoneClientScope,
} from '../data/fetch-milestone-sources.mjs';
import { buildMilestoneExportQaDoc } from '../data/milestone-export-qa.mjs';
import {
  loadAnalyticalCycleConfig,
  buildAnalyticalResponsesFromSource,
  buildAnalyticalEligibleClients,
  buildAnalyticalCyclesCatalog,
  computeEligibleMeta,
} from './analytical-response-builder.mjs';
import { resolveCycleBounds } from '../analytics/analytical-cycles.mjs';

const BASE_QV_REF = 'lacinxsvjdwalkchxyeo';
const CURRENT_ACTION_CYCLE = 'NPS-2026-SET-PHARUS';
const PREVIOUS_PAIR_CYCLE = 'NPS-2026-JUN-JUL-PHARUS';

/** @deprecated Use buildAnalyticalCyclesCatalog + data/config/nps-cycles.json */
export function syncCyclesFromSource(sourceCycles) {
  return sourceCycles.map((src) => ({
    cycle_id: src.id,
    source_cycle_id: src.id,
    cycle_name: src.name,
    starts_at: src.starts_at,
    ends_at: src.ends_at,
    source: 'BASE_QV:nps_cycles',
  }));
}

export function deriveHistoryOnAnalyticalResponses(responses, sequenceByCode) {
  const resolved = responses.filter((r) => r.client_id && r.analytical_cycle_code);
  const byClient = new Map();
  for (const r of resolved) {
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, []);
    byClient.get(r.client_id).push(r);
  }

  const out = [];
  for (const [, clientRows] of byClient) {
    const ordered = sortClientResponsesByAnalyticalSequence(clientRows, sequenceByCode);
    const derived = deriveHistoryFields(
      ordered.map((r) => ({ id: r.response_id, score: r.score, ...r })),
    );
    const withCat = derived.map((d) => ({
      ...d,
      nps_category: classifyNpsScore(d.score),
    }));
    const promotorConsistent = isPromotorConsistent(withCat);

    for (let i = 0; i < derived.length; i++) {
      const d = derived[i];
      const base = ordered[i];
      const consecutive_detractor = isConsecutiveDetractor(withCat, i);
      out.push({
        ...base,
        previous_response_id: d.previous_response_id,
        previous_score: d.previous_score,
        score_delta: d.score_delta,
        previous_category: d.previous_category,
        nps_migration: d.nps_migration,
        recurring_respondent: d.recurring_respondent,
        cycles_answered: d.cycles_answered,
        evolution_status: d.evolution_status,
        nps_category: classifyNpsScore(d.score),
        critical_flag: computeCriticalFlag(
          { ...d, nps_migration: d.nps_migration, evolution_status: d.evolution_status },
          withCat,
          i,
        ),
        _promotor_consistent: promotorConsistent,
        _consecutive_detractor: consecutive_detractor,
      });
    }
  }
  return out;
}

function buildPriorityContextForResponse(row, responseTopics, clientSatMap) {
  const topics = (responseTopics ?? []).filter((t) => t.response_id === row.response_id);
  const sat = clientSatMap?.get(row.client_id);
  return {
    has_csat: sat?.has_csat ?? false,
    latest_csat_score: sat?.latest_csat_score ?? null,
    csat_average: sat?.csat_average ?? null,
    negative_topics_count: topics.filter((t) => t.valence === 'Negativa').length,
    topics_count: topics.length,
    topics,
    comment: row.comment,
  };
}

function clientSatMapFromSummary(doc) {
  const map = new Map();
  for (const e of doc?.entries ?? []) {
    map.set(e.client_id, e);
  }
  return map;
}

export function buildActionQueueForCurrentCycle(
  responses,
  currentCycleCode = CURRENT_ACTION_CYCLE,
  options = {},
) {
  const { responseTopics = [], clientSatisfactionDoc = null } = options;
  const satMap = clientSatMapFromSummary(clientSatisfactionDoc);
  const current = responses.filter(
    (r) => r.analytical_cycle_code === currentCycleCode && r.client_id,
  );
  const queue = [];

  for (const row of current) {
    const enriched = {
      ...row,
      consecutive_detractor: row._consecutive_detractor ?? false,
      promotor_consistent: row._promotor_consistent ?? false,
      previous_category: row.previous_category,
    };
    const ctx = buildPriorityContextForResponse(row, responseTopics, satMap);
    const { priority, priority_reasons, other_signals, qualitative_signal } = computeActionPriority(
      enriched,
      ctx,
    );
    if (!priority) continue;
    queue.push({
      priority,
      reason: priority_reasons.length ? priority_reasons.join('; ') : '',
      priority_reasons,
      other_signals,
      qualitative_signal,
      client_id: row.client_id,
      client_name: row.client_name,
      ep_name: row.ep_name,
      previous_score: row.previous_score,
      current_score: row.score,
      score_delta: row.score_delta,
      previous_category: row.previous_category,
      current_category: row.nps_category,
      nps_migration: row.nps_migration,
      comment: row.comment,
      cycle_code: row.analytical_cycle_code,
      response_id: row.response_id,
    });
  }
  return queue;
}

export function validateProcessedResponses(responses) {
  const issues = [];
  for (const r of responses) {
    if (!isValidScore(r.score)) {
      issues.push({ severity: 'critical', check_name: 'validate_score', response_id: r.response_id });
      continue;
    }
    if (r.nps_category !== classifyNpsScore(r.score)) {
      issues.push({ severity: 'error', check_name: 'validate_category', response_id: r.response_id });
    }
  }
  return issues;
}

async function appendQualityEntries(entries) {
  const existing = await readJson('quality/data_quality.json', { entries: [] });
  existing.entries.push(...entries);
  existing.updated_at = new Date().toISOString();
  await writeJson('quality/data_quality.json', existing);
}

async function appendRefreshRun(run) {
  const existing = await readJson('quality/refresh_runs.json', { runs: [] });
  existing.runs.push(run);
  existing.updated_at = new Date().toISOString();
  await writeJson('quality/refresh_runs.json', existing);
}

function tryGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function buildJourneyMapFromSnapshot(clientJourneys, journeyStages) {
  const stageNameById = new Map((journeyStages ?? []).map((s) => [s.id, s.name]));
  const map = new Map();
  for (const row of clientJourneys ?? []) {
    map.set(row.client_id, stageNameById.get(row.current_stage_id) ?? null);
  }
  return map;
}

function buildTransferMapFromSnapshot(logs) {
  const map = new Map();
  for (const row of logs ?? []) {
    if (!map.has(row.client_id)) map.set(row.client_id, []);
    map.get(row.client_id).push(row);
  }
  return map;
}

function buildEpNameToIdFromSnapshot(eps) {
  const map = new Map();
  for (const ep of eps ?? []) {
    map.set((ep.name || '').trim().toLowerCase(), ep.id);
  }
  return map;
}

async function loadBaseQvFromIngestSnapshot(ingestSnapshotId) {
  const read = (name) => readJson(`raw/${ingestSnapshotId}/${name}`);
  const sourceCycles = await read('nps_cycles.json');
  const sourceRows = await read('nps_responses.json');
  const allSends = await read('nps_sends.json');
  const clientsList = await read('clients.json');
  const clientJourneys = await read('client_journeys.json');
  const journeyStages = await read('journey_stages.json');
  const transferLogs = await read('engenheiro_transfer_logs.json');
  const eps = await read('engenheiros_patrimoniais.json');

  const clientsMap = new Map((clientsList ?? []).map((c) => [c.id, c]));
  const clientIds = [
    ...new Set([
      ...(sourceRows ?? []).map((r) => r.client_id).filter(Boolean),
      ...(allSends ?? []).map((s) => s.client_id),
    ]),
  ];

  return {
    sourceCycles,
    sourceRows,
    allSends,
    clientsList,
    clientJourneys,
    journeyStages,
    transferLogs,
    eps,
    clientsMap,
    journeyMap: buildJourneyMapFromSnapshot(clientJourneys, journeyStages),
    transferMap: buildTransferMapFromSnapshot(transferLogs),
    epNameToId: buildEpNameToIdFromSnapshot(eps),
    clientIds,
    sourceCounts: {
      nps_cycles: sourceCycles?.length ?? 0,
      nps_responses: sourceRows?.length ?? 0,
      nps_sends: allSends?.length ?? 0,
      clients: clientIds.length,
      ingest_snapshot: ingestSnapshotId,
      ingest_source: 'BASE_QV_SQL_EXPORT',
    },
  };
}

/**
 * Pipeline file-based completo. Apenas SELECT no BASE QV.
 * @param {{ writeFiles?: boolean, ingestSnapshotId?: string }} [opts]
 */
export async function runFileRefresh(opts = {}) {
  const writeFiles = opts.writeFiles !== false;
  confirmBaseQvReadOnly();

  const ingestSnapshotId = opts.ingestSnapshotId ?? process.env.ANALYTICS_INGEST_SNAPSHOT ?? null;

  const refreshRunId = randomUUID();
  const startedAt = new Date().toISOString();
  const dataCutoff = startedAt;
  const snapshotId = formatRawSnapshotDir(new Date());
  const methodologyConfig = loadMethodologyConfig();

  const analyticalConfig = loadAnalyticalCycleConfig();
  const sequenceByCode = new Map(
    analyticalConfig.map((c) => [c.cycle_code, c.sequence ?? 9999]),
  );

  let sourceCycles;
  let sourceRows;
  let allSends;
  let clientsMap;
  let journeyMap;
  let transferMap;
  let epNameToId;
  let sourceCounts;
  let clientsList;
  let clientJourneys;
  let journeyStages;
  let transferLogs;
  let eps;
  let csatSourceRows = [];
  let milestoneSourceFiles = {};
  let milestoneExportQa = null;
  let milestoneFetchErrors = null;

  if (ingestSnapshotId) {
    const ing = await loadBaseQvFromIngestSnapshot(ingestSnapshotId);
    ({
      sourceCycles,
      sourceRows,
      allSends,
      clientsMap,
      journeyMap,
      transferMap,
      epNameToId,
      sourceCounts,
      clientsList,
      clientJourneys,
      journeyStages,
      transferLogs,
      eps,
    } = ing);
    try {
      csatSourceRows = await readJson(`raw/${ingestSnapshotId}/csat_responses.json`, []);
    } catch {
      csatSourceRows = [];
    }
    const milestoneNames = [
      'client_meetings.json',
      'manual_meetings.json',
      'client_mecanismos.json',
      'cancellations.json',
      'client_engajamento_history.json',
      'freeze_change_requests.json',
    ];
    for (const name of milestoneNames) {
      try {
        milestoneSourceFiles[name] = await readJson(`raw/${ingestSnapshotId}/${name}`, []);
      } catch {
        /* optional */
      }
    }
  } else {
    const baseQv = createBaseQvClient();
    sourceCycles = await fetchNpsCycles(baseQv);
    sourceRows = await fetchNpsResponses(baseQv);
    allSends = await fetchNpsSends(baseQv);
    csatSourceRows = await fetchCsatResponses(baseQv);

    const clientIds = [
      ...new Set([
        ...sourceRows.map((r) => r.client_id).filter(Boolean),
        ...allSends.map((s) => s.client_id),
        ...csatSourceRows.map((r) => r.client_id).filter(Boolean),
      ]),
    ];

    [clientsMap, journeyMap, transferMap, epNameToId] = await Promise.all([
      fetchClientsByIds(baseQv, clientIds),
      fetchJourneyStagesByClientIds(baseQv, clientIds),
      fetchTransferLogsByClientIds(baseQv, clientIds),
      fetchEpDirectory(baseQv),
    ]);

    sourceCounts = {
      nps_cycles: sourceCycles.length,
      nps_responses: sourceRows.length,
      nps_sends: allSends.length,
      csat_responses: csatSourceRows.length,
      clients: clientIds.length,
    };

    if (writeFiles) {
      [clientJourneys, journeyStages, transferLogs, eps, clientsList] = await Promise.all([
        fetchTableAll(baseQv, 'client_journeys', 'client_id, current_stage_id, template_id, started_at'),
        fetchTableAll(baseQv, 'journey_stages', 'id, name, display_order'),
        fetchTableAll(baseQv, 'engenheiro_transfer_logs', 'client_id, engenheiro_anterior, engenheiro_novo, created_at'),
        fetchTableAll(baseQv, 'engenheiros_patrimoniais', 'id, name, programa, status'),
        fetchTableAll(
          baseQv,
          'clients',
          'id, codigo, name, programa, status, segmentacao, engenheiro_patrimonial, engenheiros_anteriores, data_inicio_ciclo, created_at',
        ),
      ]);
    }

    const pharusScopeIds = pharusMilestoneClientScope(sourceRows, allSends, clientsMap);
    const { files, errors } = await fetchMilestoneSourcesBundle(baseQv, pharusScopeIds);
    milestoneSourceFiles = files;
    milestoneFetchErrors = errors;
    milestoneExportQa = buildMilestoneExportQaDoc(files);
    milestoneExportQa.scope = {
      pharus_client_ids: pharusScopeIds.length,
      note: 'Histórico exportado por client_id PHARUS (respostas + envios).',
    };
    if (Object.keys(errors).length) milestoneExportQa.fetch_errors = errors;
  }

  if (writeFiles) {
    await writeRawSnapshot(snapshotId, {
      'nps_cycles.json': sourceCycles,
      'nps_responses.json': sourceRows,
      'nps_sends.json': allSends,
      'csat_responses.json': csatSourceRows,
      'clients.json': clientsList ?? [...clientsMap.values()],
      'client_journeys.json': clientJourneys ?? [],
      'journey_stages.json': journeyStages ?? [],
      'engenheiro_transfer_logs.json': transferLogs ?? [],
      'engenheiros_patrimoniais.json': eps ?? [],
      ...milestoneSourceFiles,
    });

    if (milestoneExportQa) {
      await writeJson(`raw/${snapshotId}/milestone_sources_export_qa.json`, milestoneExportQa);
      await writeJson('quality/milestone_sources_export_qa.json', milestoneExportQa);
    }

    await writeJson(`raw/${snapshotId}/manifest.json`, {
      refresh_id: refreshRunId,
      generated_at: dataCutoff,
      source_project_ref: BASE_QV_REF,
      source_counts: sourceCounts,
      data_cutoff: dataCutoff,
      git_commit: tryGitCommit(),
      analytical_cycles: analyticalConfig.map((c) => c.cycle_code),
      ingest_from: ingestSnapshotId ?? null,
      methodology: methodologyConfig,
      milestone_sources: Object.fromEntries(
        Object.entries(milestoneSourceFiles).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
      ),
      milestone_fetch_errors: milestoneFetchErrors ?? undefined,
    });
  }

  const cycles = buildAnalyticalCyclesCatalog(sourceCycles, analyticalConfig);

  const built = buildAnalyticalResponsesFromSource({
    sourceRows,
    analyticalConfig,
    sourceCyclesFromDb: sourceCycles,
    clientsMap,
    journeyMap,
    transferMap,
    epNameToId,
    refreshRunId,
  });

  let responses = deriveHistoryOnAnalyticalResponses(built.responses, sequenceByCode);
  responses = markPairedWithPrevious(PREVIOUS_PAIR_CYCLE, CURRENT_ACTION_CYCLE, responses);

  const eligible = buildAnalyticalEligibleClients(
    analyticalConfig,
    allSends,
    clientsMap,
    journeyMap,
    transferMap,
    epNameToId,
    responses,
  );

  const cycleSummaries = analyticalConfig.map((def) => {
    const cycleResponses = responses.filter((r) => r.analytical_cycle_code === def.cycle_code);
    const eligibleMeta = computeEligibleMeta(def.cycle_code, def, eligible, cycleResponses);
    const bounds = resolveCycleBounds(def, sourceCycles);
    return buildCycleSummaryEntry(def, cycleResponses, { dataCutoff, eligibleMeta, bounds });
  });

  const junJulSummary = cycleSummaries.find((s) => s.cycle_code === PREVIOUS_PAIR_CYCLE);
  const baselineCheck = junJulSummary ? verifyJunJulBaseline(junJulSummary) : { ok: true, failures: [] };

  const qualityEntries = [...built.qualityEntries];
  const junJulEligible = eligible.filter((e) => e.analytical_cycle_code === PREVIOUS_PAIR_CYCLE);
  if (junJulSummary && junJulEligible.length < junJulSummary.valid_responses) {
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: 'warning',
      check_name: 'eligible_base_incomplete',
      message: 'Base de envios nps_sends não cobre toda a campanha Jun–Jul reconstruída',
      details: {
        valid_responses: junJulSummary.valid_responses,
        eligible_sends: junJulEligible.length,
      },
    });
  }

  if (!baselineCheck.ok) {
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: 'error',
      check_name: 'historical_gap',
      message: 'Jun–Jul/2026 diverge do baseline aprovado (reconciliation failure)',
      details: { failures: baselineCheck.failures },
    });
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: 'error',
      check_name: 'jun_jul_reconciliation_failure',
      message: 'Baseline ETAPA 2.3 não reproduzido',
      details: baselineCheck.failures,
    });
  } else if (junJulSummary?.historical_gap === 7) {
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: 'info',
      check_name: 'historical_gap',
      message: 'Gap histórico 7 vs referência externa 262 (status partial)',
      details: {
        historical_expected: 262,
        valid_after_dedupe: junJulSummary.valid_responses,
        historical_gap: 7,
      },
    });
  }

  const pairedCycles = buildPairedCycleMetrics(
    PREVIOUS_PAIR_CYCLE,
    CURRENT_ACTION_CYCLE,
    responses,
  );
  const migrationMatrix = buildMigrationMatrix(
    PREVIOUS_PAIR_CYCLE,
    CURRENT_ACTION_CYCLE,
    responses,
  );

  const validationIssues = validateProcessedResponses(responses);
  qualityEntries.push(
    ...validationIssues.map((v) => ({
      refresh_run_id: refreshRunId,
      severity: v.severity,
      check_name: v.check_name,
      source_record_id: v.response_id,
      message: v.check_name,
    })),
  );

  const epSummaryDoc = buildEpSummaryDocument(
    responses,
    eligible,
    analyticalConfig,
    dataCutoff,
  );
  const epSummaryForWrite = {
    data_cutoff: epSummaryDoc.data_cutoff,
    min_ep_sample: epSummaryDoc.min_ep_sample,
    entries: epSummaryDoc.entries.map(({ _ep_key, ...rest }) => rest),
  };
  const epSummaryInvariantErrors = validateEpSummaryInvariants(epSummaryDoc);

  const { responseTopics, topicSummary } = await buildVocArtifacts(
    responses,
    analyticalConfig,
    dataCutoff,
  );

  const { rows: csatResponses, quality: csatQuality } = buildCsatResponsesProcessed(
    csatSourceRows,
    clientsMap,
    epNameToId,
    transferMap,
    analyticalConfig,
    sourceCycles,
    cycles,
  );
  const eligibleByCycle = new Map();
  for (const e of eligible) {
    if (!e.analytical_cycle_code) continue;
    eligibleByCycle.set(e.analytical_cycle_code, {
      eligible_clients: (eligibleByCycle.get(e.analytical_cycle_code)?.eligible_clients ?? 0) + 1,
    });
  }
  const csatSummary = buildCsatSummary(csatResponses, eligibleByCycle, dataCutoff);
  const clientSatisfactionSummary = buildClientSatisfactionSummary(csatResponses, responses);
  const csatLegacyReconciliation = buildCsatLegacyReconciliation(csatResponses);
  qualityEntries.push(
    ...csatQuality.map((q) => ({
      refresh_run_id: refreshRunId,
      ...q,
    })),
  );
  if (csatLegacyReconciliation.csat_rule_ambiguous) {
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: 'warning',
      check_name: 'csat_rule_ambiguous',
      message: 'Limiar satisfeitos não reproduz legado; ver csat_legacy_reconciliation.json',
    });
  }
  if (!csatLegacyReconciliation.legacy_reproduced.satisfied_close) {
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: 'info',
      check_name: 'csat_legacy_difference',
      message: `Δ satisfeitos vs legado: ${csatLegacyReconciliation.difference.satisfied_pct?.toFixed(1)} pp`,
    });
  }

  const actionQueue = buildActionQueueForCurrentCycle(responses, CURRENT_ACTION_CYCLE, {
    responseTopics,
    clientSatisfactionDoc: clientSatisfactionSummary,
  });
  const driverArtifacts = buildDriversArtifacts({
    responses,
    csatResponses,
    responseTopics,
    clientsById: clientsMap,
    meetings: [],
    mechanisms: [],
    cycles,
    dataCutoff,
    pairedDoc: pairedCycles,
  });

  const actionQueueEnrichedDoc = buildActionQueueEnriched({
    actionQueue,
    responses,
    responseTopics,
    clientSatisfactionDoc: clientSatisfactionSummary,
    driversSummary: driverArtifacts.drivers_summary,
    cycleCode: CURRENT_ACTION_CYCLE,
    dataCutoff,
  });

  const actionTrackingDoc = await readJson('operational/action_tracking.json', { entries: [] });
  const executiveDiagnosisDoc = buildExecutiveDiagnosis({
    cycleCode: CURRENT_ACTION_CYCLE,
    cycles,
    cycleSummaryDoc: { cycles: cycleSummaries, data_cutoff: dataCutoff },
    pairedCyclesDoc: pairedCycles,
    migrationMatrixDoc: migrationMatrix,
    epSummaryDoc: epSummaryForWrite,
    topicSummaryDoc: topicSummary,
    driversSummaryDoc: driverArtifacts.drivers_summary,
    commentDriversDoc: driverArtifacts.comment_drivers,
    csatSummaryDoc: csatSummary,
    actionQueueEnrichedDoc,
    actionTrackingDoc,
    csatLegacyReconciliation,
    qualityDoc: await readJson('quality/data_quality.json', { entries: [] }),
    responses,
    dataCutoff,
  });
  executiveDiagnosisDoc.methodology = { ...methodologyConfig };

  const invariantErrors = [
    ...validateRefreshInvariants(
      responses,
      cycleSummaries,
      migrationMatrix,
      pairedCycles,
    ),
    ...epSummaryInvariantErrors.map((e) => ({
      code: 'EP',
      message: e.message,
    })),
  ];

  const errors = [...invariantErrors];
  const allowBaselineDrift = process.env.ANALYTICS_ALLOW_BASELINE_DRIFT === '1';
  if (!baselineCheck.ok) {
    qualityEntries.push({
      refresh_run_id: refreshRunId,
      severity: allowBaselineDrift ? 'warning' : 'error',
      check_name: 'jun_jul_baseline_reconciliation',
      message: allowBaselineDrift
        ? 'Jun–Jul diverge do baseline congelado (refresh com dados live)'
        : 'Jun–Jul baseline reconciliation failure',
      details: { failures: baselineCheck.failures, allow_baseline_drift: allowBaselineDrift },
    });
    if (!allowBaselineDrift) {
      errors.push({
        code: 'E',
        message: 'Jun–Jul baseline reconciliation failure',
        details: baselineCheck.failures,
      });
    }
  }

  const status =
    errors.some((e) => e.severity === 'critical' || e.code === 'E') || invariantErrors.length
      ? 'failed'
      : 'success';

  const runRecord = {
    refresh_id: refreshRunId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    raw_snapshot: snapshotId,
    data_cutoff: dataCutoff,
    source_counts: sourceCounts,
    processed_counts: {
      analytical_responses: responses.length,
      unresolved_responses: built.unresolvedRows.length,
      duplicates_removed: built.duplicate_count,
      eligible_rows: eligible.length,
      action_queue: actionQueue.length,
      action_queue_enriched: actionQueueEnrichedDoc.entries.length,
      ep_summary_rows: epSummaryForWrite.entries.length,
      response_topic_rows: responseTopics.length,
      topic_summary_rows: topicSummary.entries.length,
      csat_responses: csatResponses.length,
      driver_tests: driverArtifacts.driver_tests.length,
      executive_diagnosis: 1,
    },
    cycles_processed: analyticalConfig.map((c) => c.cycle_code),
    unresolved_responses: built.unresolvedRows.length,
    duplicates_removed: built.duplicate_count,
    warnings: qualityEntries.filter((e) => e.severity === 'warning').length,
    errors: qualityEntries.filter((e) => e.severity === 'error').length + errors.length,
    baseline_check: baselineCheck,
    cycle_summaries: cycleSummaries.map((s) => ({
      cycle_code: s.cycle_code,
      valid_responses: s.valid_responses,
      nps: s.nps,
    })),
  };

  if (writeFiles) {
    await appendQualityEntries(qualityEntries);
    await appendRefreshRun(runRecord);
    if (status === 'success') {
      await writeJson('processed/cycles.json', cycles);
      await writeTable('processed', 'responses', responses);
      await writeTable('processed', 'eligible_clients', eligible);
      await writeJson('processed/cycle_summary.json', { cycles: cycleSummaries, data_cutoff: dataCutoff });
      await writeJson('processed/paired_cycles.json', pairedCycles);
      await writeJson('processed/migration_matrix.json', migrationMatrix);
      await writeJson('processed/ep_summary.json', epSummaryForWrite);
      await writeTable('processed', 'response_topics', responseTopics);
      await writeJson('processed/topic_summary.json', topicSummary);
      await writeTable('processed', 'csat_responses', csatResponses);
      await writeJson('processed/csat_summary.json', csatSummary);
      await writeJson('processed/client_satisfaction_summary.json', clientSatisfactionSummary);
      await writeJson('quality/csat_legacy_reconciliation.json', csatLegacyReconciliation);
      await writeTable('processed', 'driver_features', driverArtifacts.driver_features);
      await writeJson('processed/driver_tests.json', driverArtifacts.driver_tests);
      await writeJson('processed/drivers_summary.json', driverArtifacts.drivers_summary);
      await writeJson('processed/comment_drivers.json', driverArtifacts.comment_drivers);
      await writeTable('outputs', 'action_queue', actionQueue);
      await writeJson('processed/action_queue_enriched.json', actionQueueEnrichedDoc);
      await writeJson('processed/executive_diagnosis.json', executiveDiagnosisDoc);
      try {
        const milestoneArtifacts = await buildNpsMilestoneArtifacts(responses, {
          rawSnapshotId: snapshotId,
          pairedDoc: pairedCycles,
          dataCutoff,
        });
        await writeJson('processed/nps_client_milestones.json', milestoneArtifacts.clientMilestonesDoc);
        await writeJson('processed/nps_milestones_summary.json', milestoneArtifacts.summaryDoc);
        await writeJson('processed/nps_between_cycle_events.json', milestoneArtifacts.betweenDoc);
        await writeJson('quality/nps_milestones_qa.json', milestoneArtifacts.qaDoc);
        try {
          const { buildNpsChangeDriverArtifacts } = await import('../analytics/nps-change-drivers-pipeline.mjs');
          const changeDriverArtifacts = await buildNpsChangeDriverArtifacts({
            betweenDoc: milestoneArtifacts.betweenDoc,
            clientMilestonesDoc: milestoneArtifacts.clientMilestonesDoc,
            summaryDoc: milestoneArtifacts.summaryDoc,
            responseTopics,
            responses,
            pairedDoc: pairedCycles,
            dataCutoff,
          });
          await writeJson('processed/nps_change_drivers.json', changeDriverArtifacts.driversDoc);
          await writeJson('quality/nps_change_drivers_qa.json', changeDriverArtifacts.qaDoc);
        } catch (driverErr) {
          qualityEntries.push({
            refresh_run_id: refreshRunId,
            severity: 'warning',
            check_name: 'nps_change_drivers_build',
            message: driverErr.message ?? 'Falha ao gerar drivers de mudança NPS',
          });
        }
        try {
          const { buildNpsFinancialProfileArtifacts } = await import(
            '../analytics/nps-financial-profile-pipeline.mjs'
          );
          const financialArtifacts = await buildNpsFinancialProfileArtifacts({
            responseTopics,
            responses,
            clientMilestonesDoc: milestoneArtifacts.clientMilestonesDoc,
            dataCutoff,
          });
          await writeJson('processed/nps_financial_profile.json', financialArtifacts.profileDoc);
          await writeJson('quality/nps_financial_profile_qa.json', financialArtifacts.qaDoc);
          try {
            const { buildNpsManagementInsightsArtifacts } = await import(
              '../analytics/nps-management-insights-pipeline.mjs'
            );
            const mgmtArtifacts = await buildNpsManagementInsightsArtifacts({
              responseTopics,
              responses,
              financialProfile: financialArtifacts.profileDoc,
              dataCutoff,
            });
            await writeJson('processed/nps_management_insights.json', mgmtArtifacts.doc);
            await writeJson('quality/nps_management_insights_qa.json', mgmtArtifacts.qaDoc);
            if (!mgmtArtifacts.qaDoc.failed) {
              /* ok */
            } else {
              qualityEntries.push({
                refresh_run_id: refreshRunId,
                severity: 'warning',
                check_name: 'nps_management_insights_cross_check',
                message: mgmtArtifacts.doc.cross_check.errors.join('; '),
              });
            }
          } catch (mgmtErr) {
            qualityEntries.push({
              refresh_run_id: refreshRunId,
              severity: 'warning',
              check_name: 'nps_management_insights_build',
              message: mgmtErr.message ?? 'Falha ao gerar insights gerenciais',
            });
          }
        } catch (finErr) {
          qualityEntries.push({
            refresh_run_id: refreshRunId,
            severity: 'warning',
            check_name: 'nps_financial_profile_build',
            message: finErr.message ?? 'Falha ao gerar perfil financeiro NPS',
          });
        }
      } catch (milestoneErr) {
        qualityEntries.push({
          refresh_run_id: refreshRunId,
          severity: 'warning',
          check_name: 'nps_milestones_build',
          message: milestoneErr.message ?? 'Falha ao gerar marcos da jornada',
        });
      }
      const latestDoc = {
        refresh_id: refreshRunId,
        generated_at: runRecord.finished_at,
        data_cutoff: dataCutoff,
        cycle_code: CURRENT_ACTION_CYCLE,
        status,
        raw_snapshot: snapshotId,
        methodology: methodologyConfig,
        artifacts: {
          cycle_summary: 'data/processed/cycle_summary.json',
          responses: 'data/processed/responses.json',
          paired_cycles: 'data/processed/paired_cycles.json',
          ep_summary: 'data/processed/ep_summary.json',
          topic_summary: 'data/processed/topic_summary.json',
          csat_summary: 'data/processed/csat_summary.json',
          drivers_summary: 'data/processed/drivers_summary.json',
          action_queue_enriched: 'data/processed/action_queue_enriched.json',
          executive_diagnosis: 'data/processed/executive_diagnosis.json',
          action_queue: 'data/outputs/action_queue.json',
        },
      };
      await writeJson('snapshots/latest.json', latestDoc);
      await writeJson(`snapshots/runs/${refreshRunId}.json`, {
        refresh_id: refreshRunId,
        generated_at: runRecord.finished_at,
        data_cutoff: dataCutoff,
        cycle_code: CURRENT_ACTION_CYCLE,
        status,
        raw_snapshot: snapshotId,
        source_snapshot: snapshotId,
        methodology: methodologyConfig,
        processed_counts: runRecord.processed_counts,
        cycle_summaries: runRecord.cycle_summaries,
      });
    }
  }

  if (status === 'failed') {
    const err = new Error(
      `Refresh falhou invariantes/baseline: ${errors.map((e) => e.message ?? e.code).join('; ')}`,
    );
    err.details = { errors, baselineCheck, runRecord };
    throw err;
  }

  return {
    refreshRunId,
    snapshotId,
    cycles,
    responses,
    eligible,
    actionQueue,
    cycleSummaries,
    pairedCycles,
    migrationMatrix,
    epSummary: epSummaryForWrite,
    qualityEntries,
    runRecord,
    baselineCheck,
  };
}
