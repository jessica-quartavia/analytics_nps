import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { guardSupabaseClient } from './read-only-guard.mjs';

dotenv.config();

const BASE_QV_REF = 'lacinxsvjdwalkchxyeo';

/**
 * Confirma política read-only antes de refresh.
 */
export function confirmBaseQvReadOnly() {
  if (process.env.ANALYTICS_ALLOW_DB_WRITES === '1') {
    throw new Error(
      'ANALYTICS_ALLOW_DB_WRITES=1 não é suportado. Bancos Supabase são somente leitura.',
    );
  }
  return true;
}

/** @returns {'service_role' | 'anon' | 'unknown'} */
export function detectSupabaseKeyRole(key) {
  if (!key || !key.includes('.')) return 'unknown';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return payload.role === 'service_role' ? 'service_role' : payload.role === 'anon' ? 'anon' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Service role necessária para SELECT em `clients` (RLS exige can_access_module).
 */
export function assertBaseQvServiceRoleKey() {
  const key = process.env.BASE_QV_SUPABASE_SERVICE_ROLE_KEY;
  const role = detectSupabaseKeyRole(key);
  if (role === 'anon') {
    throw new Error(
      'BASE_QV_SUPABASE_SERVICE_ROLE_KEY está com JWT anon. Use a service_role key do projeto BASE QV (Settings → API).',
    );
  }
}

/**
 * Cliente Supabase BASE QV — uso exclusivamente leitura (SELECT).
 */
export function createBaseQvClient() {
  confirmBaseQvReadOnly();
  const url = process.env.BASE_QV_SUPABASE_URL;
  const key = process.env.BASE_QV_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Defina BASE_QV_SUPABASE_URL e BASE_QV_SUPABASE_SERVICE_ROLE_KEY no .env',
    );
  }
  if (process.env.ANALYTICS_INGEST_SNAPSHOT) {
    throw new Error('ANALYTICS_INGEST_SNAPSHOT definido — refresh deve usar runFileRefresh({ ingestSnapshotId }) sem cliente REST.');
  }
  assertBaseQvServiceRoleKey();
  if (!url.includes(BASE_QV_REF)) {
    console.warn('Aviso: BASE_QV_SUPABASE_URL não parece ser o project_ref esperado (BASE QV).');
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return guardSupabaseClient(client);
}

/** Queries de leitura usadas pelo pipeline (documentação viva). */
export const BASE_QV_QUERIES = {
  nps_cycles: 'public.nps_cycles — SELECT',
  nps_responses: 'public.nps_responses — SELECT',
  nps_sends: 'public.nps_sends — SELECT',
  clients: 'public.clients — SELECT',
  client_journeys: 'public.client_journeys — SELECT',
  journey_stages: 'public.journey_stages — SELECT',
  engenheiro_transfer_logs: 'public.engenheiro_transfer_logs — SELECT',
  engenheiros_patrimoniais: 'public.engenheiros_patrimoniais — SELECT',
  csat_responses: 'public.csat_responses — SELECT',
  csat_cycles: 'public.csat_cycles — SELECT',
  csat_sends: 'public.csat_sends — SELECT',
  client_meetings: 'public.client_meetings — SELECT (marcos)',
  manual_meetings: 'public.manual_meetings — SELECT (marcos)',
  client_mecanismos: 'public.client_mecanismos — SELECT (marcos)',
  cancellations: 'public.cancellations — SELECT (marcos)',
  client_engajamento_history: 'public.client_engajamento_history — SELECT (marcos)',
  freeze_change_requests: 'public.freeze_change_requests — SELECT (marcos)',
};

export async function fetchCsatResponses(baseQv) {
  return fetchTableAll(
    baseQv,
    'csat_responses',
    'id, client_id, client_name, client_email, score, comment, submitted_at, created_at, tipo_de_forms, meeting_id, meeting_date, answers, typeform_response_id',
  );
}

export async function fetchTableAll(baseQv, table, select) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await baseQv
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function fetchNpsCycles(baseQv) {
  const { data, error } = await baseQv.from('nps_cycles').select('*').order('starts_at');
  if (error) throw error;
  return data ?? [];
}

export async function fetchNpsResponses(baseQv) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await baseQv
      .from('nps_responses')
      .select(
        'id, client_id, client_name, client_email, score, comment, submitted_at, typeform_response_id, raw_payload, tipo_de_forms, motivadores',
      )
      .ilike('tipo_de_forms', 'NPS%')
      .order('submitted_at')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function fetchNpsSends(baseQv) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await baseQv
      .from('nps_sends')
      .select('id, cycle_id, client_id, sent_at')
      .order('sent_at')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function fetchClientsByIds(baseQv, ids) {
  if (!ids.length) return new Map();
  const unique = [...new Set(ids)];
  const map = new Map();
  const chunk = 200;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await baseQv
      .from('clients')
      .select(
        'id, codigo, name, programa, status, segmentacao, engenheiro_patrimonial, engenheiros_anteriores',
      )
      .in('id', slice);
    if (error) throw error;
    for (const row of data ?? []) map.set(row.id, row);
  }
  return map;
}

export async function fetchJourneyStagesByClientIds(baseQv, ids) {
  if (!ids.length) return new Map();
  const unique = [...new Set(ids)];
  const map = new Map();
  const stageIds = new Set();
  const clientStage = new Map();
  const chunk = 200;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await baseQv
      .from('client_journeys')
      .select('client_id, current_stage_id')
      .in('client_id', slice);
    if (error) throw error;
    for (const row of data ?? []) {
      clientStage.set(row.client_id, row.current_stage_id);
      if (row.current_stage_id) stageIds.add(row.current_stage_id);
    }
  }
  if (!stageIds.size) return map;
  const { data: stages, error: stErr } = await baseQv
    .from('journey_stages')
    .select('id, name')
    .in('id', [...stageIds]);
  if (stErr) throw stErr;
  const stageNameById = new Map((stages ?? []).map((s) => [s.id, s.name]));
  for (const [clientId, stageId] of clientStage) {
    map.set(clientId, stageNameById.get(stageId) ?? null);
  }
  return map;
}

export async function fetchTransferLogsByClientIds(baseQv, ids) {
  if (!ids.length) return new Map();
  const unique = [...new Set(ids)];
  const map = new Map();
  for (const id of unique) map.set(id, []);
  const chunk = 100;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await baseQv
      .from('engenheiro_transfer_logs')
      .select('client_id, engenheiro_anterior, engenheiro_novo, created_at')
      .in('client_id', slice)
      .order('created_at', { ascending: true });
    if (error) throw error;
    for (const row of data ?? []) {
      map.get(row.client_id).push(row);
    }
  }
  return map;
}

export async function fetchEpDirectory(baseQv) {
  const { data, error } = await baseQv.from('engenheiros_patrimoniais').select('id, name');
  if (error) throw error;
  const map = new Map();
  for (const ep of data ?? []) {
    map.set((ep.name || '').trim().toLowerCase(), ep.id);
  }
  return map;
}
