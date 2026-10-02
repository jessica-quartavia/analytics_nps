import { randomUUID } from 'node:crypto';
import {
  createBaseQvClient,
  fetchNpsCycles,
  fetchNpsResponsesSubmittedSince,
  fetchClientsByIds,
  fetchJourneyStagesByClientIds,
  fetchTransferLogsByClientIds,
  fetchEpDirectory,
} from '../data/base-qv.mjs';
import {
  loadAnalyticalCycleConfig,
  buildAnalyticalResponsesFromSource,
} from '../pipeline/analytical-response-builder.mjs';
import { expandResponsesToWorkItems } from './voc-source-units.mjs';
import {
  loadVocSourceLookbackHours,
  loadVocSourceInitialLookbackDays,
} from './voc-source-config.mjs';

function isoMs(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function subtractHours(iso, hours) {
  const base = iso ? isoMs(iso) : Date.now();
  return new Date(base - hours * 3_600_000).toISOString();
}

function subtractDaysFromNow(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Watermark − lookback (ou janela inicial se vazio).
 * @param {string|null} watermarkIso
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveSourceFetchSince(watermarkIso, env = process.env) {
  const lookbackH = loadVocSourceLookbackHours(env);
  if (!watermarkIso) {
    return subtractDaysFromNow(loadVocSourceInitialLookbackDays(env));
  }
  return subtractHours(watermarkIso, lookbackH);
}

function attachSourceUpdatedAt(responses, sourceRowById) {
  return responses.map((r) => {
    const src = sourceRowById.get(r.response_id);
    const updated = src?.created_at ?? src?.submitted_at ?? r.submitted_at ?? null;
    return { ...r, updated_at: updated };
  });
}

/**
 * Busca respostas NPS na BASE QV (read-only), aplica dedupe/ciclo analítico oficiais.
 * @param {object} opts
 * @param {import('./voc-persistence-store.mjs').VocStore} opts.store
 * @param {NodeJS.ProcessEnv} [opts.env]
 */
export async function fetchAnalyticalResponsesFromBaseQv(opts) {
  const env = opts.env ?? process.env;
  const watermark = await opts.store.getVocSourceWatermark();
  const sinceIso = resolveSourceFetchSince(watermark, env);

  const baseQv = createBaseQvClient();
  const analyticalConfig = loadAnalyticalCycleConfig();
  const sourceCycles = await fetchNpsCycles(baseQv);
  const sourceRows = await fetchNpsResponsesSubmittedSince(baseQv, sinceIso);

  const clientIds = [...new Set(sourceRows.map((r) => r.client_id).filter(Boolean))];
  const [clientsMap, journeyMap, transferMap, epNameToId] = await Promise.all([
    fetchClientsByIds(baseQv, clientIds),
    fetchJourneyStagesByClientIds(baseQv, clientIds),
    fetchTransferLogsByClientIds(baseQv, clientIds),
    fetchEpDirectory(baseQv),
  ]);

  const sourceRowById = new Map(sourceRows.map((r) => [r.id, r]));
  const built = buildAnalyticalResponsesFromSource({
    sourceRows,
    analyticalConfig,
    sourceCyclesFromDb: sourceCycles,
    clientsMap,
    journeyMap,
    transferMap,
    epNameToId,
    refreshRunId: randomUUID(),
  });

  const responses = attachSourceUpdatedAt(built.responses, sourceRowById);
  return {
    responses,
    meta: {
      source_mode: 'base_qv',
      fetch_since: sinceIso,
      watermark,
      source_rows: sourceRows.length,
      analytical_responses: responses.length,
      duplicate_dropped: built.duplicate_count ?? 0,
    },
  };
}

/**
 * Unidades VoC a partir da BASE QV (read-only).
 */
export async function loadWorkItemsFromBaseQv(opts) {
  const { responses, meta } = await fetchAnalyticalResponsesFromBaseQv(opts);
  return {
    workItems: expandResponsesToWorkItems(responses),
    meta,
  };
}
