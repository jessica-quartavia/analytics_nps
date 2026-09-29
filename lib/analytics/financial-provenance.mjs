import { readJson } from '../data/file-store.mjs';

/** @typedef {'raw_snapshot'|'fallback_export'|'missing'} FinancialSourceKind */

/**
 * Carrega mapas separados raw vs fallback e proveniência por client_id.
 */
export async function loadFinancialProvenance(opts = {}) {
  const latest = opts.latestSnapshot ?? (await readJson('snapshots/latest.json', null));
  const snapshotId = opts.rawSnapshotId ?? latest?.raw_snapshot;

  const rawRows = snapshotId
    ? await readJson(`raw/${snapshotId}/client_financial_data.json`, [])
    : [];
  const fallbackRows = await readJson('quality/set_financial_export.json', []);

  const rawMap = new Map(
    (Array.isArray(rawRows) ? rawRows : []).filter((r) => r?.client_id).map((r) => [r.client_id, r]),
  );
  const fallbackMap = new Map(
    (Array.isArray(fallbackRows) ? fallbackRows : [])
      .filter((r) => r?.client_id)
      .map((r) => [r.client_id, r]),
  );

  const financialByClient = new Map(rawMap);
  for (const [id, row] of fallbackMap) {
    if (!financialByClient.has(id)) financialByClient.set(id, row);
  }

  /** @param {string} clientId @returns {FinancialSourceKind} */
  function sourceForClient(clientId) {
    if (!financialByClient.has(clientId)) return 'missing';
    if (rawMap.has(clientId)) return 'raw_snapshot';
    return 'fallback_export';
  }

  return {
    snapshotId,
    rawMap,
    fallbackMap,
    financialByClient,
    sourceForClient,
    meta: {
      raw_row_count: rawMap.size,
      fallback_row_count: fallbackMap.size,
      merged_row_count: financialByClient.size,
    },
  };
}

export function countSourcesForClientIds(clientIds, sourceForClient) {
  const counts = { raw_snapshot: 0, fallback_export: 0, missing: 0 };
  for (const id of clientIds) {
    const s = sourceForClient(id);
    counts[s]++;
  }
  return counts;
}
