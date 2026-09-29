import { guardQueryBuilder } from './read-only-guard.mjs';

const CHUNK = 80;
const PAGE = 1000;

/** Definições SELECT-only por tabela BASE QV. */
export const MILESTONE_SOURCE_TABLES = {
  client_meetings: {
    file: 'client_meetings.json',
    select:
      'client_id, start_time, event_name, host_email, created_at',
  },
  manual_meetings: {
    file: 'manual_meetings.json',
    select: 'client_id, start_time, title, created_at',
  },
  client_mecanismos: {
    file: 'client_mecanismos.json',
    select:
      'client_id, mecanismo_id, status, implemented_at, no_plano, created_at',
  },
  cancellations: {
    file: 'cancellations.json',
    select:
      'client_id, programa, created_at, data_pedido, churn_efetivado_at, intencao_registrada_at, engenheiro_snapshot',
  },
  client_engajamento_history: {
    file: 'client_engajamento_history.json',
    select: 'client_id, old_value, new_value, created_at',
  },
  freeze_change_requests: {
    file: 'freeze_change_requests.json',
    select:
      'client_id, request_type, status, created_at, data_inicio_congelamento, data_descongelamento, reviewed_at',
  },
  client_financial_data: {
    file: 'client_financial_data.json',
    select:
      'client_id, ultima_renda_mensal, ultimo_aporte, reserva_liquidez, cheque_especial, parcelamento_cartao, credito_pessoal, credito_consignado, updated_at, created_at',
  },
};

async function fetchTableForClientIds(baseQv, table, select, clientIds) {
  if (!clientIds.length) return [];
  const all = [];
  for (let i = 0; i < clientIds.length; i += CHUNK) {
    const slice = clientIds.slice(i, i + CHUNK);
    let from = 0;
    for (;;) {
      const q = guardQueryBuilder(baseQv.from(table)).select(select).in('client_id', slice);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return all;
}

/**
 * Exporta fontes temporais para marcos (SELECT, escopo client_id).
 * Falha por tabela vira { error, rows: [] } — demais tabelas continuam.
 */
export async function fetchMilestoneSourcesBundle(baseQv, clientIds) {
  const files = {};
  const errors = {};

  for (const [table, cfg] of Object.entries(MILESTONE_SOURCE_TABLES)) {
    try {
      files[cfg.file] = await fetchTableForClientIds(baseQv, table, cfg.select, clientIds);
    } catch (err) {
      errors[table] = err.message ?? String(err);
      files[cfg.file] = [];
    }
  }

  return { files, errors };
}

export function pharusMilestoneClientScope(sourceRows, allSends, clientsMap, eligibleRows = []) {
  const ids = new Set();
  const norm = (p) => (p ?? '').trim().toUpperCase();

  for (const r of sourceRows ?? []) {
    if (!r.client_id) continue;
    const c = clientsMap?.get?.(r.client_id);
    if (!c || norm(c.programa) === 'PHARUS') ids.add(r.client_id);
  }
  for (const s of allSends ?? []) {
    if (s.client_id) ids.add(s.client_id);
  }
  for (const e of eligibleRows ?? []) {
    if (e.client_id && (!e.program || norm(e.program) === 'PHARUS')) ids.add(e.client_id);
  }
  return [...ids];
}
