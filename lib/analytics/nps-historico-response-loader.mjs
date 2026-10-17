import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MEASUREMENTS_MIN_SUBMITTED_ISO } from './nps-historico-measurements-constants.mjs';

export { MEASUREMENTS_MIN_SUBMITTED_ISO };

const INGEST_PARTIALS = ['ingest/partials/nps_responses_1.json', 'ingest/partials/nps_responses_2.json'];

function readJsonArray(root, rel) {
  const path = join(root, 'data', rel);
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(raw) ? raw : raw?.rows ?? [];
}

/** Normaliza linha bruta public.nps_responses → formato analítico mínimo. */
export function normalizeBaseQvNpsResponseRow(row) {
  if (!row) return null;
  const score = row.score ?? row.nota_nps ?? row.nps_score;
  return {
    response_id: row.response_id ?? row.id ?? null,
    client_id: row.client_id ? String(row.client_id) : null,
    score,
    submitted_at: row.submitted_at ?? row.response_date ?? row.data_resposta ?? null,
    analytical_cycle_code: row.analytical_cycle_code ?? row.cycle_code ?? null,
    program: row.program ?? row.programa ?? 'PHARUS',
    source: row.source ?? 'BASE_QV',
    tipo_de_forms: row.tipo_de_forms ?? 'NPS',
  };
}

function responseDedupeKey(row) {
  if (row.response_id) return `id:${row.response_id}`;
  return `k:${row.client_id}|${row.submitted_at}|${row.score}`;
}

/**
 * Unifica processed/responses.json + partials de ingest (fallback estático).
 * Preferir fetch BASE QV em generate-historico2 quando .env disponível.
 */
export function loadStaticBaseQvResponsesForMeasurements(root) {
  const processed = readJsonArray(root, 'processed/responses.json');
  const byKey = new Map();
  for (const rel of INGEST_PARTIALS) {
    for (const row of readJsonArray(root, rel)) {
      const n = normalizeBaseQvNpsResponseRow(row);
      if (n?.client_id) byKey.set(responseDedupeKey(n), n);
    }
  }
  for (const row of processed) {
    const n = normalizeBaseQvNpsResponseRow(row);
    if (n?.client_id) byKey.set(responseDedupeKey(n), n);
  }
  return [...byKey.values()];
}

export async function loadBaseQvResponsesForMeasurements(root) {
  try {
    const { createBaseQvClient, fetchNpsResponsesSubmittedSince } = await import('../data/base-qv.mjs');
    const baseQv = createBaseQvClient();
    const raw = await fetchNpsResponsesSubmittedSince(baseQv, MEASUREMENTS_MIN_SUBMITTED_ISO);
    const processed = readJsonArray(root, 'processed/responses.json').map(normalizeBaseQvNpsResponseRow);
    const byKey = new Map(processed.filter(Boolean).map((r) => [responseDedupeKey(r), r]));
    for (const row of raw ?? []) {
      const n = normalizeBaseQvNpsResponseRow(row);
      if (n?.client_id) byKey.set(responseDedupeKey(n), n);
    }
    return [...byKey.values()];
  } catch (err) {
    return loadStaticBaseQvResponsesForMeasurements(root);
  }
}
