import {
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  phoneMatchKeys,
} from './pharus-app-match.mjs';
import { safraFromDate } from './customer-nps-cohorts.mjs';
import {
  classifyNpsScore,
  dedupeLatestNpsByClient,
  npsScoreFromRow,
  isValidScore,
  calculateNpsSummary,
} from './nps.mjs';

export { normalizeCpf, normalizeEmail, normalizePhone };

export const ENTRY_MATCH_CONFIDENCE = {
  base_qv_id: 1.0,
  cpf: 1.0,
  email: 0.95,
  phone: 0.9,
};

const METHOD_ORDER = ['base_qv_id', 'cpf', 'email', 'phone'];

export function parseEntryDate(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const iso = s.includes('T') ? s : `${s.slice(0, 10)}T12:00:00.000Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function base0RowKey(row) {
  const id = row.base_qv_id ?? row.codigo_cliente ?? '';
  const entry = parseEntryDate(row.data_entrada) ?? '';
  return `${id}|${entry}`;
}

function uniqueEntryDates(rows) {
  const dates = new Set();
  for (const r of rows ?? []) {
    const d = parseEntryDate(r.data_entrada);
    if (d) dates.add(d);
  }
  return [...dates];
}

function classifyRows(rows) {
  if (!rows?.length) return { status: 'none', entry_date: null, rows: [] };
  const dates = uniqueEntryDates(rows);
  if (dates.length > 1) return { status: 'conflict', entry_date: null, rows };
  const entry_date = dates[0] ?? null;
  if (!entry_date) return { status: 'no_date', entry_date: null, rows };
  if (rows.length > 1) return { status: 'ok', entry_date, rows: [rows[0]] };
  return { status: 'ok', entry_date, rows };
}

/**
 * Índices BASE0 para match em batch (somente data_entrada + identificadores).
 */
export function buildBase0EntryDateIndexes(base0Rows) {
  const byBaseQvId = new Map();
  const byCpf = new Map();
  const byEmail = new Map();
  const byPhone = new Map();

  const duplicateAudit = {
    base_qv_id_multi_date: 0,
    cpf_multi_date: 0,
    email_multi_date: 0,
    phone_multi_date: 0,
  };

  function push(map, key, row) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  for (const row of base0Rows ?? []) {
    const id = row.base_qv_id ? String(row.base_qv_id).trim() : '';
    const cpf = normalizeCpf(row.cpf_norm ?? row.cpf_raw ?? row.cpf);
    const email = normalizeEmail(row.email_norm ?? row.email);
    const phoneRaw = row.telefone_norm ?? row.telefone ?? row.phone;
    push(byBaseQvId, id, row);
    push(byCpf, cpf, row);
    push(byEmail, email, row);
    for (const pk of phoneMatchKeys(phoneRaw)) push(byPhone, pk, row);
  }

  for (const map of [byBaseQvId, byCpf, byEmail, byPhone]) {
    for (const [, rows] of map) {
      if (rows.length > 1 && uniqueEntryDates(rows).length > 1) {
        if (map === byBaseQvId) duplicateAudit.base_qv_id_multi_date += 1;
        if (map === byCpf) duplicateAudit.cpf_multi_date += 1;
        if (map === byEmail) duplicateAudit.email_multi_date += 1;
        if (map === byPhone) duplicateAudit.phone_multi_date += 1;
      }
    }
  }

  return { byBaseQvId, byCpf, byEmail, byPhone, duplicateAudit };
}

function rowsForMethod(method, client, indexes) {
  switch (method) {
    case 'base_qv_id':
      return indexes.byBaseQvId.get(client.client_id) ?? [];
    case 'cpf':
      return indexes.byCpf.get(normalizeCpf(client.cpf)) ?? [];
    case 'email':
      return indexes.byEmail.get(normalizeEmail(client.email)) ?? [];
    case 'phone': {
      const keys = phoneMatchKeys(client.phone);
      const out = [];
      const seen = new Set();
      for (const k of keys) {
        for (const r of indexes.byPhone.get(k) ?? []) {
          const rk = base0RowKey(r);
          if (!seen.has(rk)) {
            seen.add(rk);
            out.push(r);
          }
        }
      }
      return out;
    }
    default:
      return [];
  }
}

/**
 * Match BASE QV → BASE0 (somente data_entrada).
 * @param {{ client_id: string, cpf?: string, email?: string, phone?: string }} client
 */
export function matchBaseQvClientToBase0(client, indexes) {
  const methodHits = {};
  for (const method of METHOD_ORDER) {
    const rows = rowsForMethod(method, client, indexes);
    methodHits[method] = classifyRows(rows);
  }

  for (const method of METHOD_ORDER) {
    if (methodHits[method].status === 'conflict') {
      return {
        entry_date: null,
        entry_date_match_method: 'ambiguous',
        entry_date_match_confidence: null,
        entry_date_conflict: true,
        entry_date_ambiguous_reason: `base0_duplicate_${method}`,
      };
    }
  }

  let chosen = null;
  for (const method of METHOD_ORDER) {
    const hit = methodHits[method];
    if (hit.status === 'ok' && hit.entry_date) {
      chosen = {
        method,
        entry_date: hit.entry_date,
        row: hit.rows[0],
        confidence: ENTRY_MATCH_CONFIDENCE[method],
      };
      break;
    }
  }

  if (!chosen) {
    return {
      entry_date: null,
      entry_date_match_method: 'unmatched',
      entry_date_match_confidence: null,
      entry_date_conflict: false,
    };
  }

  const chosenKey = base0RowKey(chosen.row);
  for (const method of METHOD_ORDER) {
    if (method === chosen.method) continue;
    const hit = methodHits[method];
    if (hit.status !== 'ok' || !hit.entry_date) continue;
    const otherKey = base0RowKey(hit.rows[0]);
    if (otherKey !== chosenKey && hit.entry_date !== chosen.entry_date) {
      return {
        entry_date: null,
        entry_date_match_method: 'ambiguous',
        entry_date_match_confidence: null,
        entry_date_conflict: true,
        entry_date_ambiguous_reason: 'cross_identifier_mismatch',
      };
    }
  }

  return {
    entry_date: chosen.entry_date,
    entry_date_match_method: chosen.method,
    entry_date_match_confidence: chosen.confidence,
    entry_date_conflict: false,
  };
}

export function monthsBetweenDates(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const s = new Date(`${startIso.slice(0, 10)}T12:00:00.000Z`);
  const e = new Date(`${endIso.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
}

function maskClientName(name) {
  const s = String(name ?? '').trim();
  if (!s) return '—';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

function matchMethodBadge(method) {
  const map = {
    base_qv_id: 'ID',
    cpf: 'CPF',
    email: 'Email',
    phone: 'Telefone',
    unmatched: '—',
    ambiguous: 'Ambíguo',
  };
  return map[method] ?? method;
}

function aggregateCohortNps(clientsInCohort) {
  const withNps = clientsInCohort.filter((c) => c.nps_score != null && isValidScore(c.nps_score));
  const scores = withNps.map((c) => c.nps_score);
  const summary = withNps.length
    ? calculateNpsSummary(withNps.map((c) => ({ score: c.nps_score })))
    : null;
  const avg =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;
  return {
    clients: clientsInCohort.length,
    nps_responses: withNps.length,
    nps: summary?.nps ?? null,
    promoters: summary?.promoters ?? 0,
    neutrals: summary?.passives ?? 0,
    detractors: summary?.detractors ?? 0,
    promoter_pct: summary?.promoterPct ?? null,
    neutral_pct: summary?.passivePct ?? null,
    detractor_pct: summary?.detractorPct ?? null,
    average_score: avg,
  };
}

function sortCohort(a, b) {
  if (a === 'Sem safra') return 1;
  if (b === 'Sem safra') return -1;
  return a.localeCompare(b);
}

/**
 * Monta dataset Histórico 2 (BASE QV + data_entrada BASE0).
 */
export function buildHistorico2Dataset({ baseQvClients, base0Rows, npsResponses, asOfDate }) {
  const indexes = buildBase0EntryDateIndexes(base0Rows);
  const latestNpsByClient = new Map();
  for (const row of dedupeLatestNpsByClient(npsResponses ?? [])) {
    const id = row.client_id ?? row.base_qv_id;
    if (!id) continue;
    const score = npsScoreFromRow(row);
    if (score == null) continue;
    latestNpsByClient.set(String(id), {
      nps_score: score,
      nps_category: classifyNpsScore(score),
      nps_submitted_at: row.submitted_at ?? row.response_date ?? null,
      nps_source: 'base_qv',
    });
  }

  const asOf = parseEntryDate(asOfDate) ?? new Date().toISOString().slice(0, 10);
  const audit = {
    base_qv_total: 0,
    matched_total: 0,
    with_entry_date: 0,
    without_entry_date: 0,
    coverage_pct: null,
    by_method: {
      base_qv_id: 0,
      cpf: 0,
      email: 0,
      phone: 0,
      unmatched: 0,
      ambiguous: 0,
    },
    conflicts: 0,
    base0_duplicate_audit: indexes.duplicateAudit,
    invalid_entry_dates: 0,
    future_entry_dates: 0,
    qa_samples: {
      base_qv_id: [],
      cpf: [],
      email: [],
      phone: [],
      unmatched: [],
      ambiguous: [],
    },
  };

  const clients = [];
  for (const c of baseQvClients ?? []) {
    const client_id = c.id ?? c.client_id;
    if (!client_id) continue;
    audit.base_qv_total += 1;

    const matchInput = {
      client_id: String(client_id),
      cpf: c.cpf_norm ?? c.cpf ?? null,
      email: c.email ?? c.client_email ?? null,
      phone: c.phone ?? c.telefone ?? null,
    };
    const match = matchBaseQvClientToBase0(matchInput, indexes);
    audit.by_method[match.entry_date_match_method] =
      (audit.by_method[match.entry_date_match_method] ?? 0) + 1;

    if (match.entry_date_match_method !== 'unmatched' && match.entry_date_match_method !== 'ambiguous') {
      audit.matched_total += 1;
    }
    if (match.entry_date_conflict) audit.conflicts += 1;

    let entry_date = match.entry_date;
    if (entry_date && entry_date > asOf) {
      audit.future_entry_dates += 1;
      entry_date = null;
    }

    const safra = entry_date ? safraFromDate(`${entry_date}T12:00:00.000Z`) : null;
    const entry_cohort = safra?.safra_trimestre ?? null;
    const entry_year = safra?.safra_ano ?? null;
    const entry_month = safra?.safra_mes ?? null;

    if (entry_date) audit.with_entry_date += 1;
    else audit.without_entry_date += 1;

    const nps = latestNpsByClient.get(String(client_id)) ?? {
      nps_score: null,
      nps_category: null,
      nps_submitted_at: null,
      nps_source: null,
    };

    const tenureRef = nps.nps_submitted_at
      ? parseEntryDate(nps.nps_submitted_at)
      : asOf;
    const tenure_months = entry_date ? monthsBetweenDates(entry_date, tenureRef) : null;

    const record = {
      client_id: String(client_id),
      name: c.name ?? c.client_name ?? null,
      name_display: maskClientName(c.name ?? c.client_name),
      client_email: matchInput.email || null,
      program: c.programa ?? c.program ?? null,
      ep: c.engenheiro_patrimonial ?? c.ep_name ?? c.ep ?? null,
      status: c.status ?? null,
      entry_date,
      entry_cohort,
      entry_year,
      entry_month,
      entry_date_match_method: match.entry_date_match_method,
      entry_date_match_confidence: match.entry_date_match_confidence,
      entry_date_conflict: match.entry_date_conflict === true,
      match_method_label: matchMethodBadge(match.entry_date_match_method),
      tenure_months,
      nps_score: nps.nps_score,
      nps_category: nps.nps_category,
      nps_submitted_at: nps.nps_submitted_at,
      nps_source: nps.nps_source,
      attributes_source: 'base_qv',
      entry_date_source: entry_date ? 'base0.data_entrada' : null,
    };
    clients.push(record);

    const sampleKey = match.entry_date_match_method;
    if (audit.qa_samples[sampleKey] && audit.qa_samples[sampleKey].length < 5) {
      audit.qa_samples[sampleKey].push({
        client_id: record.client_id,
        entry_date: record.entry_date,
        method: record.entry_date_match_method,
      });
    }
  }

  audit.coverage_pct =
    audit.base_qv_total > 0
      ? Math.round((audit.with_entry_date / audit.base_qv_total) * 1000) / 10
      : null;

  const cohortMap = new Map();
  for (const c of clients) {
    const key = c.entry_cohort ?? 'Sem safra';
    if (!cohortMap.has(key)) cohortMap.set(key, []);
    cohortMap.get(key).push(c);
  }

  const cohort_summaries = [...cohortMap.entries()]
    .map(([entry_cohort, rows]) => ({
      entry_cohort,
      ...aggregateCohortNps(rows),
    }))
    .sort((a, b) => sortCohort(a.entry_cohort, b.entry_cohort));

  const program_by_cohort = [];
  const ep_by_cohort = [];
  for (const [entry_cohort, rows] of cohortMap) {
    const progCounts = new Map();
    const epCounts = new Map();
    for (const r of rows) {
      const p = r.program ?? 'Não informado';
      progCounts.set(p, (progCounts.get(p) ?? 0) + 1);
      const ep = r.ep ?? 'Não informado';
      if (!epCounts.has(ep)) epCounts.set(ep, { clients: 0, responses: 0, scores: [] });
      const bucket = epCounts.get(ep);
      bucket.clients += 1;
      if (r.nps_score != null) {
        bucket.responses += 1;
        bucket.scores.push(r.nps_score);
      }
    }
    for (const [program, count] of progCounts) {
      program_by_cohort.push({ entry_cohort, program, clients: count });
    }
    for (const [ep, bucket] of epCounts) {
      const summary = bucket.scores.length
        ? calculateNpsSummary(bucket.scores.map((score) => ({ score })))
        : null;
      ep_by_cohort.push({
        entry_cohort,
        ep,
        clients: bucket.clients,
        nps_responses: bucket.responses,
        nps: summary?.nps ?? null,
      });
    }
  }

  program_by_cohort.sort((a, b) => sortCohort(a.entry_cohort, b.entry_cohort) || a.program.localeCompare(b.program));
  ep_by_cohort.sort((a, b) => sortCohort(a.entry_cohort, b.entry_cohort) || a.ep.localeCompare(b.ep));

  const npsConsidered = clients.filter((c) => c.nps_score != null).length;
  const distinctCohorts = cohort_summaries.filter((c) => c.entry_cohort !== 'Sem safra').length;

  return {
    meta: {
      generated_at: new Date().toISOString(),
      as_of_date: asOf,
      nps_source: 'base_qv.processed/responses.json',
      entry_date_source: 'base0.clientes.data_entrada',
      attributes_source: 'base_qv',
    },
    kpis: {
      clients_with_entry_date: audit.with_entry_date,
      clients_without_entry_date: audit.without_entry_date,
      match_coverage_pct: audit.coverage_pct,
      distinct_entry_cohorts: distinctCohorts,
      nps_responses_considered: npsConsidered,
      base_qv_clients: audit.base_qv_total,
    },
    audit,
    cohort_summaries,
    program_by_cohort,
    ep_by_cohort,
    clients,
  };
}
