/**
 * @typedef {object} AnalyticsCycle
 * @property {string} cycle_id
 * @property {string|null} source_cycle_id
 * @property {string} cycle_code
 * @property {string} cycle_name
 * @property {string|null} starts_at
 * @property {string|null} ends_at
 */

/**
 * @typedef {object} NpsSendRow
 * @property {string} cycle_id source nps_cycles.id
 * @property {string} client_id
 * @property {string} sent_at
 */

/**
 * Resolução explícita de ciclo para uma resposta NPS.
 *
 * Ordem:
 * 1) nps_sends coerente (send antes da resposta + submitted dentro da janela do ciclo do send)
 * 2) submitted_at dentro de starts_at/ends_at
 * 3) ambiguidade → warning
 * 4) nenhum → error
 *
 * @param {object} input
 * @param {string} input.clientId
 * @param {string|Date} input.submittedAt
 * @param {NpsSendRow[]} input.sendsForClient
 * @param {AnalyticsCycle[]} input.analyticsCycles keyed by source_cycle_id
 * @returns {{ status: 'ok'|'warning'|'error'|'unresolved', cycle_id?: string|null, cycle_resolution_status?: string, method?: string, message?: string, details?: object }}
 */
export function resolveCycleForResponse(input) {
  const { clientId, submittedAt, sendsForClient, analyticsCycles } = input;
  const submittedMs = new Date(submittedAt).getTime();
  if (Number.isNaN(submittedMs)) {
    return {
      status: 'error',
      message: 'submitted_at inválido',
      details: { clientId, submittedAt },
    };
  }

  const cyclesBySource = new Map(
    analyticsCycles
      .filter((c) => c.source_cycle_id)
      .map((c) => [c.source_cycle_id, c]),
  );

  const sendMatches = [];
  for (const send of sendsForClient) {
    const cycle = cyclesBySource.get(send.cycle_id);
    if (!cycle) continue;
    const sentMs = new Date(send.sent_at).getTime();
    if (sentMs > submittedMs) continue;
    if (!isWithinCycleWindow(submittedMs, cycle.starts_at, cycle.ends_at)) continue;
    sendMatches.push({ cycle, send, method: 'nps_send' });
  }

  if (sendMatches.length === 1) {
    return {
      status: 'ok',
      cycle_id: sendMatches[0].cycle.cycle_id,
      method: 'nps_send',
      details: { send_id: sendMatches[0].send },
    };
  }

  if (sendMatches.length > 1) {
    const uniqueCycleIds = [...new Set(sendMatches.map((m) => m.cycle.cycle_id))];
    if (uniqueCycleIds.length === 1) {
      return {
        status: 'ok',
        cycle_id: uniqueCycleIds[0],
        method: 'nps_send',
        details: { multiple_sends_same_cycle: sendMatches.length },
      };
    }
    const picked = pickLatestCycle(sendMatches.map((m) => m.cycle));
    return {
      status: 'warning',
      cycle_id: picked.cycle_id,
      method: 'nps_send',
      message: 'Múltiplos nps_sends apontam para ciclos diferentes — escolhido ciclo mais recente',
      details: { clientId, submittedAt, cycles: sendMatches.map((m) => m.cycle.cycle_code) },
    };
  }

  const windowMatches = analyticsCycles.filter((c) =>
    isWithinCycleWindow(submittedMs, c.starts_at, c.ends_at),
  );

  if (windowMatches.length === 1) {
    return {
      status: 'ok',
      cycle_id: windowMatches[0].cycle_id,
      method: 'submitted_at_window',
    };
  }

  if (windowMatches.length > 1) {
    const picked = pickLatestCycle(windowMatches);
    return {
      status: 'warning',
      cycle_id: picked.cycle_id,
      method: 'submitted_at_window',
      message: 'submitted_at cai em mais de uma janela — escolhido ciclo mais recente',
      details: {
        clientId,
        submittedAt,
        cycles: windowMatches.map((c) => c.cycle_code),
      },
    };
  }

  return {
    status: 'unresolved',
    cycle_id: null,
    cycle_resolution_status: 'unresolved',
    message: 'Nenhum ciclo conhecido para a resposta (ex.: pré-T2)',
    details: { clientId, submittedAt },
  };
}

export function isWithinCycleWindow(submittedMs, startsAt, endsAt) {
  const startMs = startsAt ? new Date(startsAt).getTime() : Number.NEGATIVE_INFINITY;
  const endMs = endsAt ? new Date(endsAt).getTime() : Number.POSITIVE_INFINITY;
  return submittedMs >= startMs && submittedMs <= endMs;
}

/**
 * Deduplica por client_id + cycle_id — mantém submitted_at mais recente.
 * @param {Array<{ client_id: string, cycle_id: string, submitted_at: string, source_response_id: string }>} rows
 */
export function dedupeResponsesByClientCycle(rows) {
  const byKey = new Map();
  const discarded = [];

  for (const row of rows) {
    const key = `${row.client_id}::${row.cycle_id ?? '__unresolved__'}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingTs = new Date(existing.submitted_at).getTime();
    const rowTs = new Date(row.submitted_at).getTime();
    if (rowTs >= existingTs) {
      discarded.push({ kept: row, removed: existing });
      byKey.set(key, row);
    } else {
      discarded.push({ kept: existing, removed: row });
    }
  }

  return { kept: [...byKey.values()], discarded };
}

/**
 * Mapeia nps_cycles.name → cycle_code estável.
 * @param {string} name
 */
function pickLatestCycle(cycles) {
  return [...cycles].sort(
    (a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime(),
  )[0];
}

export function cycleCodeFromSourceName(name) {
  const slug = (name || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-]/g, '')
    .toUpperCase();
  return slug || 'UNKNOWN';
}

/**
 * Status analítico a partir do ciclo fonte.
 * @param {string|null} startsAt
 * @param {string|null} endsAt
 */
export function inferCycleStatus(startsAt, endsAt, nowMs = Date.now()) {
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const end = endsAt ? new Date(endsAt).getTime() : null;
  if (start != null && nowMs < start) return 'draft';
  if (end != null && nowMs > end) return 'closed';
  return 'open';
}
