import { DEFAULT_ACTION_STATUS } from './action-config.mjs';

export function trackingKey(clientId, cycleCode) {
  return `${clientId}::${cycleCode}`;
}

/**
 * @param {object[]} enrichedEntries
 * @param {{ entries?: object[] }} trackingDoc
 * @returns {object[]}
 */
export function mergeActionTracking(enrichedEntries, trackingDoc) {
  const byKey = new Map();
  for (const t of trackingDoc?.entries ?? []) {
    if (!t.client_id || !t.cycle_code) continue;
    byKey.set(trackingKey(t.client_id, t.cycle_code), t);
  }

  return (enrichedEntries ?? []).map((row) => {
    const track = byKey.get(trackingKey(row.client_id, row.cycle_code));
    return {
      ...row,
      status: track?.status ?? DEFAULT_ACTION_STATUS,
      owner: track?.owner ?? '',
      action_notes: track?.action_notes ?? '',
      tracking_updated_at: track?.updated_at ?? null,
    };
  });
}

/**
 * @param {object} trackingDoc
 * @param {object} patch { client_id, cycle_code, status?, owner?, action_notes? }
 * @returns {object} updated doc
 */
export function upsertTrackingEntry(trackingDoc, patch) {
  const doc = {
    entries: [...(trackingDoc?.entries ?? [])],
    updated_at: new Date().toISOString(),
  };
  const idx = doc.entries.findIndex(
    (e) => e.client_id === patch.client_id && e.cycle_code === patch.cycle_code,
  );
  const next = {
    client_id: patch.client_id,
    cycle_code: patch.cycle_code,
    status: patch.status ?? DEFAULT_ACTION_STATUS,
    owner: patch.owner ?? '',
    action_notes: patch.action_notes ?? '',
    updated_at: doc.updated_at,
  };
  if (idx >= 0) {
    doc.entries[idx] = { ...doc.entries[idx], ...next };
  } else {
    doc.entries.push(next);
  }
  return doc;
}
