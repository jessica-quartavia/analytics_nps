/**
 * Regra canônica — cliente ativo analítico (carteira atual).
 * Fonte: BASE QV (clients.status + cancellations.churn_efetivado_at + freeze_change_requests).
 *
 * Não confundir com população de campanha NPS (eligible / respondentes).
 */

function parseTs(v) {
  if (v == null || v === '') return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function normalizeClientStatus(status) {
  return (status ?? '').trim();
}

/** Status cadastral bruto sugere ativo (não é decisão final). */
export function isRawStatusActive(status) {
  const s = normalizeClientStatus(status).toLowerCase();
  if (!s) return false;
  if (s.includes('congel') || s.includes('freeze')) return false;
  if (s.includes('churn') || s.includes('cancel')) return false;
  return s === 'ativo' || s.startsWith('ativo');
}

function freezeEffectiveAt(row) {
  return (
    row?.effective_at ??
    row?.data_efetiva ??
    row?.data_inicio_congelamento ??
    row?.reviewed_at ??
    row?.created_at ??
    null
  );
}

function isFreezeActiveState(row) {
  const s = `${row?.tipo ?? ''} ${row?.request_type ?? ''} ${row?.status ?? ''} ${row?.type ?? ''}`.toLowerCase();
  if (s.includes('descongel') || s.includes('unfreeze')) return false;
  if (s.includes('congel') || s.includes('freeze')) return true;
  return false;
}

/** Cancelamento efetivo confirmado (precedência sobre status cadastral). */
export function getEffectiveCancellation(clientId, cancellations = []) {
  const rows = (cancellations ?? []).filter((c) => c.client_id === clientId);
  let best = null;
  for (const row of rows) {
    const at = row.churn_efetivado_at ?? row.data_churn ?? null;
    if (!at) continue;
    const signal = row.churn_efetivado_at
      ? 'cancellations.churn_efetivado_at'
      : 'cancellations.data_churn';
    const ts = parseTs(at);
    if (!best || (ts != null && ts >= (parseTs(best.cancellation_date) ?? 0))) {
      best = {
        signal,
        cancellation_date: at,
        source_row: row,
      };
    }
  }
  return best;
}

/** Pedido/intenção sem efetivação — não remove da base ativa. */
export function getChurnRequestWithoutEffective(clientId, cancellations = []) {
  const rows = (cancellations ?? []).filter((c) => c.client_id === clientId);
  for (const row of rows) {
    const effective = row.churn_efetivado_at ?? row.data_churn;
    if (effective) continue;
    const requested =
      row.intencao_registrada_at ?? row.data_pedido ?? row.requested_at ?? row.created_at ?? null;
    if (requested) {
      return {
        signal: row.intencao_registrada_at
          ? 'cancellations.intencao_registrada_at'
          : 'cancellations.data_pedido',
        requested_at: requested,
      };
    }
  }
  return null;
}

export function getCurrentFreezeState(client, freezeRows = []) {
  const clientId = client?.id ?? client?.client_id;
  if (!clientId) return null;

  const rows = (freezeRows ?? [])
    .filter((r) => r.client_id === clientId)
    .sort((a, b) => (parseTs(freezeEffectiveAt(b)) ?? 0) - (parseTs(freezeEffectiveAt(a)) ?? 0));

  if (rows.length && isFreezeActiveState(rows[0])) {
    return {
      frozen: true,
      freeze_status: rows[0].status ?? rows[0].request_type ?? 'congelado',
      freeze_date: freezeEffectiveAt(rows[0]),
      source: 'freeze_change_requests',
    };
  }

  const status = normalizeClientStatus(client?.status).toLowerCase();
  if (status.includes('congel')) {
    return {
      frozen: true,
      freeze_status: client.status,
      freeze_date: client?.data_congelamento ?? client?.data_inicio_congelamento ?? null,
      source: 'clients.status',
    };
  }

  const cong = client?.data_congelamento ?? client?.data_inicio_congelamento ?? null;
  const descong = client?.data_descongelamento ?? client?.data_descongelamento_at ?? null;
  if (cong) {
    const congTs = parseTs(cong);
    const descongTs = parseTs(descong);
    const stillFrozen = descongTs == null || (congTs != null && descongTs <= congTs);
    if (stillFrozen) {
      return {
        frozen: true,
        freeze_status: 'congelado (datas client)',
        freeze_date: cong,
        source: 'clients.data_congelamento',
      };
    }
  }

  return { frozen: false };
}

/**
 * @param {object} client registro clients (id, status, programa, …)
 * @param {{ cancellations?: object[], freezeRows?: object[] }} context
 */
export function resolveAnalyticalActiveClient(client, context = {}) {
  const { cancellations = [], freezeRows = [] } = context;
  const rawStatus = normalizeClientStatus(client?.status);
  const rawActive = isRawStatusActive(rawStatus);
  const statusLower = rawStatus.toLowerCase();

  const effectiveCancel = getEffectiveCancellation(client?.id ?? client?.client_id, cancellations);
  if (effectiveCancel) {
    return {
      is_active_analytical: false,
      final_analytical_status: 'Inativo (cancelamento efetivo)',
      active_reason: 'Cancelamento efetivo confirmado na BASE QV',
      active_quality: 'good',
      raw_status: rawStatus || null,
      effective_cancellation_signal: effectiveCancel.signal,
      cancellation_date: effectiveCancel.cancellation_date,
      churn_request_only: getChurnRequestWithoutEffective(client?.id, cancellations),
    };
  }

  const freeze = getCurrentFreezeState(client, freezeRows);
  if (freeze?.frozen) {
    return {
      is_active_analytical: false,
      final_analytical_status: 'Inativo (congelado)',
      active_reason: 'Cliente congelado — fora da base ativa',
      active_quality: freeze.source === 'freeze_change_requests' ? 'good' : 'partial',
      raw_status: rawStatus || null,
      freeze_status: freeze.freeze_status,
      freeze_date: freeze.freeze_date,
      freeze_source: freeze.source,
    };
  }

  if (statusLower.includes('churn') || statusLower.includes('cancel')) {
    return {
      is_active_analytical: false,
      final_analytical_status: 'Inativo (status cadastral)',
      active_reason: 'Status cadastral indica churn/cancelamento',
      active_quality: 'partial',
      raw_status: rawStatus,
    };
  }

  if (!rawStatus) {
    return {
      is_active_analytical: false,
      final_analytical_status: 'Indeterminado',
      active_reason: 'Status cadastral ausente',
      active_quality: 'low',
      raw_status: null,
    };
  }

  if (rawActive) {
    return {
      is_active_analytical: true,
      final_analytical_status: 'Ativo',
      active_reason: 'Status analítico Ativo (sem cancelamento efetivo nem congelamento)',
      active_quality: 'good',
      raw_status: rawStatus,
      churn_request_only: getChurnRequestWithoutEffective(client?.id, cancellations),
    };
  }

  return {
    is_active_analytical: false,
    final_analytical_status: 'Inativo',
    active_reason: 'Status cadastral não classificado como Ativo',
    active_quality: 'good',
    raw_status: rawStatus,
  };
}
