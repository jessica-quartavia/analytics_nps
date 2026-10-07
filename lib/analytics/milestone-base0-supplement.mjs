/**
 * Converte fontes BASE0 (Business Data) para o formato do snapshot raw de marcos.
 * client_id = base_qv_id (mesmo UUID usado em responses.client_id).
 */

export function base0MecanismosToSnapshotRows(mecanismos = []) {
  const out = [];
  for (const m of mecanismos) {
    const client_id = m.base_qv_id ?? m.client_id;
    const implemented_at = m.data_implementacao ?? m.data_real ?? m.implemented_at ?? null;
    if (!client_id) continue;
    out.push({
      client_id,
      mecanismo_id: m.mecanismo_id ?? m.mecanismo_nome ?? null,
      status: m.status ?? null,
      implemented_at,
      data_implementacao: implemented_at,
      no_plano: m.no_plano ?? null,
      created_at: m.created_at ?? null,
    });
  }
  return out;
}

export function base0ReunioesToSnapshotRows(reunioes = []) {
  const out = [];
  for (const r of reunioes) {
    const client_id = r.base_qv_id ?? r.client_id;
    const start_time = r.inicio_brasilia ?? r.start_time ?? null;
    if (!client_id || !start_time) continue;
    out.push({
      client_id,
      start_time,
      event_name: r.nome_evento ?? r.event_name ?? null,
      created_at: r.created_at ?? null,
    });
  }
  return out;
}

/** Prefere snapshot BASE QV quando populado; senão BASE0. */
export function mergeMilestoneSourceFiles(loaded, supplement) {
  const merged = { ...loaded };
  if (!supplement) return merged;

  for (const [file, rows] of Object.entries(supplement)) {
    if (!Array.isArray(rows) || !rows.length) continue;
    const cur = merged[file];
    const curLen = Array.isArray(cur) ? cur.length : 0;
    if (curLen >= rows.length) continue;
    merged[file] = rows;
  }
  return merged;
}

export function buildMilestoneSupplementFromBase0({ mecanismos = [], reunioes = [] } = {}) {
  return {
    'client_mecanismos.json': base0MecanismosToSnapshotRows(mecanismos),
    'client_meetings.json': base0ReunioesToSnapshotRows(reunioes),
  };
}
