import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from '../data/file-store.mjs';

const OPTIONAL_RAW_FILES = [
  'client_meetings.json',
  'manual_meetings.json',
  'client_mecanismos.json',
  'cancellations.json',
  'cancellation_history.json',
  'retention_contact_log.json',
  'client_engajamento_history.json',
  'freeze_change_requests.json',
];

function tryReadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Carrega fontes auxiliares de um diretório raw (snapshot refresh ou ingest). */
export async function loadMilestoneSourcesFromDir(rawDir) {
  const loaded = {};
  const counts = {};

  const read = (name) => {
    const p = join(rawDir, name);
    const data = tryReadJson(p);
    if (data != null) {
      loaded[name] = data;
      counts[name] = Array.isArray(data) ? data.length : Object.keys(data).length;
    }
    return data;
  };

  read('clients.json');
  read('client_journeys.json');
  read('journey_stages.json');
  read('engenheiro_transfer_logs.json');

  for (const f of OPTIONAL_RAW_FILES) read(f);

  return { rawDir, loaded, counts, sources_loaded: counts };
}

export async function resolveMilestoneRawDir(dataRoot, opts = {}) {
  if (opts.rawDir) return opts.rawDir;
  if (opts.rawSnapshotId) return join(dataRoot, 'raw', opts.rawSnapshotId);
  try {
    const latest = await readJson('snapshots/latest.json', null);
    if (latest?.raw_snapshot) return join(dataRoot, 'raw', latest.raw_snapshot);
  } catch {
    /* ignore */
  }
  return null;
}

/** Normaliza reuniões de client_meetings + manual_meetings. */
export function normalizeMeetings(loaded) {
  const out = [];
  for (const row of loaded['client_meetings.json'] ?? []) {
    const start = row.start_time ?? row.scheduled_at ?? row.meeting_date ?? row.created_at;
    if (!row.client_id || !start) continue;
    out.push({ client_id: row.client_id, start_time: start, source: 'client_meetings' });
  }
  for (const row of loaded['manual_meetings.json'] ?? []) {
    const start = row.start_time ?? row.meeting_date ?? row.created_at;
    if (!row.client_id || !start) continue;
    out.push({ client_id: row.client_id, start_time: start, source: 'manual_meetings' });
  }
  return out;
}

export function normalizeMechanisms(loaded) {
  const rows = loaded['client_mecanismos.json'] ?? [];
  return rows
    .filter((m) => m.client_id)
    .map((m) => ({
      client_id: m.client_id,
      implemented_at: m.implemented_at ?? m.data_implementacao ?? null,
      has_implemented_at: Boolean(m.implemented_at ?? m.data_implementacao),
    }));
}

export function normalizeChurnEvents(loaded) {
  const out = [];
  const push = (row, atField) => {
    const at = row[atField] ?? row.created_at ?? row.requested_at;
    if (!row.client_id || !at) return;
    out.push({ client_id: row.client_id, event_at: at, source: atField });
  };
  for (const row of loaded['cancellations.json'] ?? []) {
    const at =
      row.requested_at ??
      row.data_pedido ??
      row.intencao_registrada_at ??
      row.churn_at ??
      row.churn_efetivado_at ??
      row.created_at;
    if (row.client_id && at) out.push({ client_id: row.client_id, event_at: at, source: 'cancellations' });
  }
  for (const row of loaded['cancellation_history.json'] ?? []) push(row, 'created_at');
  for (const row of loaded['retention_contact_log.json'] ?? []) push(row, 'contact_at');
  return out;
}

export function buildTransferIndex(loaded) {
  const byClient = new Map();
  for (const row of loaded['engenheiro_transfer_logs.json'] ?? []) {
    if (!row.client_id) continue;
    if (!byClient.has(row.client_id)) byClient.set(row.client_id, []);
    byClient.get(row.client_id).push(row);
  }
  for (const list of byClient.values()) {
    list.sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at));
  }
  return byClient;
}

function parseTs(v) {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function buildClientsMap(loaded) {
  const map = new Map();
  for (const c of loaded['clients.json'] ?? []) {
    if (c.id) map.set(c.id, c);
  }
  return map;
}

export function normalizeFreezeEvents(loaded) {
  return (loaded['freeze_change_requests.json'] ?? []).filter((r) => r.client_id);
}

export function buildStageNameMap(loaded) {
  const map = new Map();
  for (const s of loaded['journey_stages.json'] ?? []) {
    if (s.id) map.set(s.id, s.name ?? s.id);
  }
  return map;
}
