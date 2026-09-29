import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { calculateNpsSummary, isValidScore } from './nps.mjs';
import { inferCycleStatus } from './cycles.mjs';

/** Fim do dia civil no fuso operacional BR (UTC−3): instante UTC no dia seguinte às 02:59:59.999. */
export const BRAZIL_END_OF_DAY_UTC = Object.freeze({
  '2026-10-15': '2026-10-16T02:59:59.999Z',
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = join(__dirname, '../../data/config/nps-cycles.json');

/**
 * @typedef {object} SourceCycleRow
 * @property {string} id
 * @property {string} name
 * @property {string|null} starts_at
 * @property {string|null} ends_at
 */

/**
 * @param {string} [configPath]
 */
export function loadAnalyticalCycleConfig(configPath = DEFAULT_CONFIG_PATH) {
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Resolve ends_at dinâmico a partir de nps_cycles (ex.: T2.ends_at).
 * @param {object} cycleDef
 * @param {SourceCycleRow[]} sourceCyclesFromDb
 */
export function resolveCycleBounds(cycleDef, sourceCyclesFromDb) {
  let starts_at = cycleDef.starts_at;
  let ends_at = cycleDef.ends_at;

  if (cycleDef.ends_at_source_cycle_name) {
    const src = sourceCyclesFromDb.find((s) => s.name === cycleDef.ends_at_source_cycle_name);
    if (src?.ends_at) ends_at = src.ends_at;
  }

  return { starts_at, ends_at };
}

/**
 * Status operacional do ciclo analítico (open = parcial, closed = fechado).
 * @param {object} cycleDef
 * @param {{ starts_at: string|null, ends_at: string|null }} bounds
 * @param {number} [nowMs]
 */
export function operationalCycleStatus(cycleDef, bounds, nowMs = Date.now()) {
  if (cycleDef.type === 'historical_reconstruction') {
    return cycleDef.reconstruction_status ?? 'partial';
  }
  return inferCycleStatus(bounds.starts_at, bounds.ends_at, nowMs);
}

/**
 * @param {string|Date} submittedAt
 * @param {string|null} startsAt
 * @param {string|null} endsAt
 */
export function isWithinBounds(submittedAt, startsAt, endsAt) {
  const t = new Date(submittedAt).getTime();
  if (Number.isNaN(t)) return false;
  const startMs = startsAt ? new Date(startsAt).getTime() : Number.NEGATIVE_INFINITY;
  const endMs = endsAt ? new Date(endsAt).getTime() : Number.POSITIVE_INFINITY;
  return t >= startMs && t <= endMs;
}

/**
 * @param {object} response
 * @param {object} client
 * @param {object} cycleDef
 * @param {SourceCycleRow[]} sourceCyclesFromDb
 */
export function matchesAnalyticalCycle(response, client, cycleDef, sourceCyclesFromDb) {
  if (cycleDef.program && client?.programa !== cycleDef.program) return false;
  if (!response.client_id) return false;
  if (!isValidScore(response.score)) return false;
  if (!response.tipo_de_forms?.toUpperCase().startsWith('NPS')) return false;

  const { starts_at, ends_at } = resolveCycleBounds(cycleDef, sourceCyclesFromDb);
  return isWithinBounds(response.submitted_at, starts_at, ends_at);
}

/**
 * Atribui ciclo analítico (prioridade: reconstrução histórica antes de source_cycle posterior).
 * @param {object} response
 * @param {object|null} client
 * @param {object[]} config
 * @param {SourceCycleRow[]} sourceCyclesFromDb
 */
export function resolveAnalyticalCycleForResponse(response, client, config, sourceCyclesFromDb) {
  const list = Array.isArray(config) ? config : [config];
  const ordered = [...list].sort((a, b) => {
    const rank = (t) => (t === 'historical_reconstruction' ? 0 : 1);
    return rank(a.type) - rank(b.type);
  });

  for (const cycleDef of ordered) {
    if (!matchesAnalyticalCycle(response, client, cycleDef, sourceCyclesFromDb)) continue;

    const src = sourceCyclesFromDb.find((s) => cycleDef.source_cycle_ids?.includes(s.id));
    const legacy_payload_missing = response.raw_payload == null;

    return {
      analytical_cycle_code: cycleDef.cycle_code,
      analytical_cycle_name: cycleDef.cycle_name,
      program: cycleDef.program,
      source_cycle_id: src?.id ?? cycleDef.source_cycle_ids?.[0] ?? null,
      source_cycle_name: src?.name ?? cycleDef.source_cycle_names?.[0] ?? null,
      cycle_resolution_method: cycleDef.resolution_method,
      legacy_payload_missing,
      cycle_type: cycleDef.type,
    };
  }

  return null;
}

/**
 * Dedupe oficial: 1 resposta por client_id + analytical_cycle_code (mais recente submitted_at).
 * @param {Array<object>} rows com client_id, submitted_at, analytical_cycle_code
 */
export function dedupeByClientAndAnalyticalCycle(rows) {
  const byKey = new Map();
  const removed = [];

  for (const row of rows) {
    const key = `${row.client_id}::${row.analytical_cycle_code}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingTs = new Date(existing.submitted_at).getTime();
    const rowTs = new Date(row.submitted_at).getTime();
    if (rowTs >= existingTs) {
      removed.push({ kept: row, removed: existing });
      byKey.set(key, row);
    } else {
      removed.push({ kept: existing, removed: row });
    }
  }

  return { kept: [...byKey.values()], removed };
}

/**
 * Monta respostas PHARUS para ciclo Jun–Jul a partir de linhas enriquecidas.
 * @param {Array<object>} allResponses
 * @param {Map<string, object>} clientsById
 * @param {object[]} config
 * @param {SourceCycleRow[]} sourceCyclesFromDb
 */
export function buildJunJulPharusDataset(allResponses, clientsById, config, sourceCyclesFromDb) {
  const cycleDef = config.find((c) => c.cycle_code === 'NPS-2026-JUN-JUL-PHARUS');
  if (!cycleDef) throw new Error('Config NPS-2026-JUN-JUL-PHARUS ausente');

  const staged = [];
  for (const r of allResponses) {
    const client = r.client_id ? clientsById.get(r.client_id) : null;
    const assignment = resolveAnalyticalCycleForResponse(r, client, [cycleDef], sourceCyclesFromDb);
    if (!assignment) continue;
    staged.push({
      ...r,
      ...assignment,
    });
  }

  const { kept, removed } = dedupeByClientAndAnalyticalCycle(staged);
  const npsSummary = calculateNpsSummary(kept.map((r) => ({ score: r.score })));

  const meta = cycleDef;
  return {
    cycleDef: meta,
    bounds: resolveCycleBounds(cycleDef, sourceCyclesFromDb),
    raw_count: staged.length,
    valid_after_dedupe: kept.length,
    duplicates_removed: removed.length,
    removed,
    responses: kept,
    npsSummary,
    reconciliation: {
      historical_expected_responses: meta.historical_expected_responses,
      source_raw_responses: staged.length,
      valid_responses_after_dedupe: kept.length,
      historical_gap: (meta.historical_expected_responses ?? 0) - kept.length,
      historical_reconciliation_status: 'partial',
      legacy_payload_missing_count: kept.filter((r) => r.legacy_payload_missing).length,
      reconstruction_status: meta.reconstruction_status,
      reconstruction_confidence: meta.reconstruction_confidence,
      missing_vs_historical: (meta.historical_expected_responses ?? 0) - kept.length,
    },
  };
}

/**
 * Garante que PHARUS no source T2 não gere ciclo analítico separado além de Jun–Jul.
 * @param {object[]} config
 */
export function getIndependentPharusSourceCycles(config) {
  const junJul = config.find((c) => c.cycle_code === 'NPS-2026-JUN-JUL-PHARUS');
  if (!junJul?.absorbs_source_cycle_pharus) return config;
  return config.filter(
    (c) =>
      c.cycle_code === 'NPS-2026-JUN-JUL-PHARUS' ||
      !junJul.source_cycle_ids?.some((id) => c.source_cycle_ids?.includes(id)),
  );
}
