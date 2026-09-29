/**
 * Reconstrói EP na data da resposta.
 *
 * @param {object} input
 * @param {string} input.clientId
 * @param {string|Date} input.responseDate
 * @param {string|null} input.currentEpName clients.engenheiro_patrimonial
 * @param {Array<{ engenheiro_anterior: string, engenheiro_novo: string, created_at: string }>} input.transferLogs asc created_at
 * @param {Array<{ name: string, changed_at: string }>} input.previousFromJson clients.engenheiros_anteriores
 * @param {Map<string, string>} input.epNameToId engenheiros_patrimoniais name -> id
 * @returns {{ ep_id: string|null, ep_name: string|null, resolution_method: string, confidence: string }}
 */
export function resolveEpAtDate(input) {
  const {
    clientId,
    responseDate,
    currentEpName,
    transferLogs = [],
    previousFromJson = [],
    epNameToId = new Map(),
  } = input;

  const at = new Date(responseDate).getTime();
  if (Number.isNaN(at)) {
    return unresolved(clientId, 'invalid responseDate');
  }

  const transfersBeforeOrAt = transferLogs
    .filter((t) => new Date(t.created_at).getTime() <= at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (transfersBeforeOrAt.length > 0) {
    const last = transfersBeforeOrAt[transfersBeforeOrAt.length - 1];
    const epName = (last.engenheiro_novo || '').trim() || null;
    return mapEp(epName, epNameToId, 'transfer_log', 'high');
  }

  const transfersAfter = transferLogs
    .filter((t) => new Date(t.created_at).getTime() > at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (transfersAfter.length > 0) {
    const epName = (transfersAfter[0].engenheiro_anterior || '').trim() || null;
    const jsonHint = findJsonEpAtDate(previousFromJson, at);
    let confidence = 'high';
    let resolution_method = 'transfer_log';

    if (jsonHint && epName && normalizeName(jsonHint) !== normalizeName(epName)) {
      confidence = 'medium';
    } else if (jsonHint && epName && normalizeName(jsonHint) === normalizeName(epName)) {
      resolution_method = 'transfer_log';
      confidence = 'high';
    }

    return mapEp(epName, epNameToId, resolution_method, confidence);
  }

  if (transferLogs.length === 0 && currentEpName) {
    const jsonHint = findJsonEpAtDate(previousFromJson, at);
    if (jsonHint && normalizeName(jsonHint) !== normalizeName(currentEpName)) {
      return mapEp(jsonHint, epNameToId, 'historical_json', 'medium');
    }
    return mapEp(currentEpName, epNameToId, 'current_proxy', 'low');
  }

  const jsonOnly = findJsonEpAtDate(previousFromJson, at);
  if (jsonOnly) {
    return mapEp(jsonOnly, epNameToId, 'historical_json', 'medium');
  }

  if (currentEpName) {
    return mapEp(currentEpName, epNameToId, 'current_proxy', 'low');
  }

  return unresolved(clientId, 'no EP sources');
}

function findJsonEpAtDate(previousFromJson, atMs) {
  const sorted = [...previousFromJson].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
  );
  let epAtTime = null;
  for (const entry of sorted) {
    if (new Date(entry.changed_at).getTime() > atMs) break;
    epAtTime = entry.name;
  }
  return epAtTime;
}

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

function mapEp(epName, epNameToId, resolution_method, confidence) {
  const name = epName?.trim() || null;
  if (!name) {
    return {
      ep_id: null,
      ep_name: null,
      resolution_method: 'unresolved',
      confidence: 'low',
    };
  }
  const id =
    epNameToId.get(normalizeName(name)) ||
    epNameToId.get(name) ||
    null;
  return {
    ep_id: id,
    ep_name: name,
    resolution_method,
    confidence,
  };
}

function unresolved(_clientId, _reason) {
  return {
    ep_id: null,
    ep_name: null,
    resolution_method: 'unresolved',
    confidence: 'low',
  };
}
