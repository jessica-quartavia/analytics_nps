import { normalizeBaseQvClientId } from './historico2-entry-date-match.mjs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return UUID_RE.test(String(value ?? '').trim());
}

/**
 * Auditoria BASE0.base_qv_id × BASE QV client_id (somente cruzamento de data_entrada).
 */
export function buildNpsHistoricoBase0MatchAudit({ baseQvClients = [], base0Rows = [] } = {}) {
  const baseQvIds = new Set(
    (baseQvClients ?? [])
      .map((c) => normalizeBaseQvClientId(c.id ?? c.client_id))
      .filter(Boolean),
  );

  let base0WithId = 0;
  let base0IdNull = 0;
  let base0InvalidUuid = 0;
  const base0IdSet = new Set();
  const idToBase0Rows = new Map();

  for (const row of base0Rows ?? []) {
    const raw = row.base_qv_id;
    if (raw == null || String(raw).trim() === '') {
      base0IdNull += 1;
      continue;
    }
    if (!isValidUuid(raw)) {
      base0InvalidUuid += 1;
      continue;
    }
    base0WithId += 1;
    const id = normalizeBaseQvClientId(raw);
    base0IdSet.add(id);
    if (!idToBase0Rows.has(id)) idToBase0Rows.set(id, []);
    idToBase0Rows.get(id).push(row);
  }

  const intersection = [...base0IdSet].filter((id) => baseQvIds.has(id));
  const base0IdsNotInQv = [...base0IdSet].filter((id) => !baseQvIds.has(id));
  const qvIdsNotInBase0 = [...baseQvIds].filter((id) => !base0IdSet.has(id));

  const duplicateBaseQvId = [...idToBase0Rows.entries()].filter(([, rows]) => rows.length > 1);
  const conflictingEntryDates = duplicateBaseQvId.filter(([, rows]) => {
    const dates = new Set(
      rows.map((r) => r.data_entrada).filter((d) => d != null && String(d).trim() !== ''),
    );
    return dates.size > 1;
  });

  return {
    base_qv_total: baseQvIds.size,
    base_qv_distinct_ids: baseQvIds.size,
    base0_total: (base0Rows ?? []).length,
    base0_with_base_qv_id: base0WithId,
    base0_base_qv_id_null: base0IdNull,
    base0_base_qv_id_invalid_uuid: base0InvalidUuid,
    base0_distinct_base_qv_id: base0IdSet.size,
    id_intersection: intersection.length,
    id_intersection_pct:
      base0IdSet.size > 0
        ? Math.round((intersection.length / base0IdSet.size) * 1000) / 10
        : null,
    base0_ids_not_in_base_qv: base0IdsNotInQv.length,
    base_qv_ids_not_in_base0: qvIdsNotInBase0.length,
    duplicate_base_qv_id_rows: duplicateBaseQvId.length,
    conflicting_entry_dates: conflictingEntryDates.length,
    samples: {
      base0_ids_not_in_base_qv: base0IdsNotInQv.slice(0, 10),
      base_qv_ids_not_in_base0: qvIdsNotInBase0.slice(0, 10),
      duplicate_base_qv_id: duplicateBaseQvId.slice(0, 5).map(([id, rows]) => ({
        base_qv_id: id,
        rows: rows.length,
        entry_dates: [...new Set(rows.map((r) => r.data_entrada))],
      })),
    },
  };
}
