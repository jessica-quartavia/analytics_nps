#!/usr/bin/env node
/**
 * Fase 0 — auditoria antes do upgrade UI (BASE0 + BASE QV + histórico + defasagem).
 * Business Data: .env (postgres ou PostgREST schema base0).
 * BASE QV: opcional via BASE_QV_* (somente leitura).
 */
import { readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  safraFromDate,
  resolveClientEntryDate,
} from '../lib/analytics/customer-nps-cohorts.mjs';
import { isValidScore } from '../lib/analytics/nps.mjs';
import { loadBusinessDataSupabaseConfig, assertBusinessDataProject } from '../lib/persistence/voc-supabase-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

const TODAY = new Date('2026-10-06T12:00:00.000Z');
const TODAY_ISO = TODAY.toISOString().slice(0, 10);

function readJson(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function fileMeta(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return { path: rel, missing: true };
  const st = statSync(p);
  return { path: rel, mtime: st.mtime.toISOString(), bytes: st.size };
}

function maxTsInArray(arr, fields) {
  let max = null;
  for (const row of arr ?? []) {
    for (const f of fields) {
      const v = row?.[f];
      if (!v) continue;
      const s = String(v).slice(0, 19);
      if (!max || s > max) max = s;
    }
  }
  return max;
}

function parseDateOnly(v) {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function quarterFromIso(d) {
  if (!d) return null;
  return safraFromDate(`${d}T12:00:00.000Z`).safra_trimestre;
}

function npsFromScores(scores) {
  const valid = scores.filter((s) => isValidScore(s)).map(Number);
  if (!valid.length) return { n: 0, nps: null, avg: null };
  let p = 0;
  let d = 0;
  for (const s of valid) {
    if (s >= 9) p += 1;
    else if (s <= 6) d += 1;
  }
  const n = valid.length;
  return {
    n,
    nps: Math.round(((p - d) / n) * 1000) / 10,
    avg: Math.round((valid.reduce((a, b) => a + b, 0) / n) * 100) / 100,
  };
}

function tenureBucket(days) {
  if (days == null || !Number.isFinite(days)) return null;
  if (days <= 90) return '0–3 meses';
  if (days <= 180) return '3–6';
  if (days <= 365) return '6–12';
  if (days <= 545) return '12–18';
  if (days <= 730) return '18–24';
  return '24+';
}

async function fetchBase0Clientes(sb) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('clientes')
      .select(
        'base_qv_id,codigo_cliente,nome,data_pagamento_entrada,data_entrada,programa,ep,status_base_qv',
      )
      .range(from, from + page - 1);
    if (error) throw new Error(`base0.clientes: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

async function fetchFirstPayments(sb) {
  const rows = [];
  const page = 2000;
  for (let from = 0; ; from += page) {
    const { data: chunk, error: err } = await sb
      .from('pagamentos_programa')
      .select('base_qv_id,data_pagamento,conta_como_programa,match_por,valor')
      .eq('conta_como_programa', true)
      .not('base_qv_id', 'is', null)
      .order('data_pagamento', { ascending: true })
      .range(from, from + page - 1);
    if (err) throw new Error(`pagamentos: ${err.message}`);
    if (!chunk?.length) break;
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  const minByClient = new Map();
  for (const r of rows) {
    const id = r.base_qv_id;
    const d = parseDateOnly(r.data_pagamento);
    if (!id || !d) continue;
    const prev = minByClient.get(id);
    if (!prev || d < prev) minByClient.set(id, d);
  }
  return minByClient;
}

async function fetchBase0Nps(sb) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('nps_respostas')
      .select('base_qv_id,codigo_cliente,data_resposta,nota,categoria,onda,dedupe_key')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function tryPostgres(sqlFn) {
  try {
    const { connectBase0 } = await import('../lib/base0/db.mjs');
    const pg = connectBase0();
    const out = await sqlFn(pg);
    await pg.end({ timeout: 5 });
    return out;
  } catch {
    return null;
  }
}

async function main() {
  const stagnation = {
    snapshots_latest: fileMeta('data/snapshots/latest.json'),
    deploy_latest: fileMeta('data/deploy/public/snapshots/latest.json'),
    ingest_clients: fileMeta('data/ingest/partials/clients.json'),
    processed_responses: fileMeta('data/processed/responses.json'),
    processed_cohorts: fileMeta('data/processed/customer_nps_cohorts.json'),
    processed_historico: fileMeta('data/processed/historical_nps_responses.json'),
  };

  const latest = readJson('data/snapshots/latest.json');
  const responses = readJson('data/processed/responses.json') ?? [];
  const clientsPartial = readJson('data/ingest/partials/clients.json') ?? [];
  const journeys = readJson('data/ingest/partials/client_journeys.json') ?? [];
  const journeyByClient = new Map(journeys.map((j) => [j.client_id, j]));

  const localTimestamps = {
    last_build_at: latest?.generated_at ?? null,
    last_ingest_raw_snapshot: latest?.raw_snapshot ?? null,
    data_cutoff: latest?.data_cutoff ?? null,
    last_nps_response_at_local_dataset: maxTsInArray(responses, [
      'submitted_at',
      'source_updated_at',
    ]),
    last_client_update_at_local_ingest: maxTsInArray(clientsPartial, [
      'updated_at',
      'created_at',
    ]),
    current_responses_count: responses.length,
  };

  let last_base_qv_source_at = null;
  const bqUrl = process.env.BASE_QV_SUPABASE_URL;
  const bqKey = process.env.BASE_QV_SUPABASE_SERVICE_ROLE_KEY;
  if (bqUrl?.includes('lacinx') && bqKey) {
    const bq = createClient(bqUrl, bqKey, { auth: { persistSession: false } });
    const { data: clientsAgg } = await bq
      .from('clients')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    const { data: npsAgg } = await bq
      .from('nps_responses')
      .select('submitted_at')
      .order('submitted_at', { ascending: false })
      .limit(1);
    last_base_qv_source_at = {
      clients_max_updated: clientsAgg?.[0]?.updated_at ?? null,
      nps_max_submitted: npsAgg?.[0]?.submitted_at ?? null,
    };
  }

  const bdCfg = loadBusinessDataSupabaseConfig();
  assertBusinessDataProject(bdCfg);
  const bd = createClient(bdCfg.url, bdCfg.serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema: 'base0' },
  });

  const importRun = await bd
    .from('import_runs')
    .select('id,status,finished_at,started_at')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const base0Quality = {};
  for (const [table, filter] of [
    ['clientes', null],
    ['nps_respostas', null],
    ['reunioes', null],
    ['pagamentos_programa', null],
    ['reembolsos_omie', null],
    ['cotas_mecanismos', null],
  ]) {
    const q = bd.from(table).select('*', { count: 'exact', head: true });
    const { count } = await q;
    base0Quality[table] = count;
  }
  const { count: pagSemMatch } = await bd
    .from('pagamentos_programa')
    .select('*', { count: 'exact', head: true })
    .or('match_por.is.null,match_por.eq.Sem match');

  const histCounts = await tryPostgres(async (pg) => {
    const [row] = await pg`
      select
        (select count(*)::int from nps_historico.respostas) as historico_respostas,
        (select count(*)::int from nps_historico.medicoes) as historico_medicoes
    `;
    return row;
  });

  const clientes = await fetchBase0Clientes(bd);
  const firstPay = await fetchFirstPayments(bd);
  const base0Nps = await fetchBase0Nps(bd);

  const paymentAudit = {
    total_clients: clientes.length,
    with_payment_date: 0,
    without_payment_date: 0,
    future_payment_dates: 0,
    conflict_client_vs_fact: 0,
    recovered_from_payments: 0,
    invalid_dates: 0,
    future_cases: [],
    conflict_cases: [],
  };

  const cohortCompare = {
    old_rule: {},
    new_rule: {},
    changed_safra: 0,
    no_safra_old: 0,
    no_safra_new: 0,
    future_excluded: 0,
    recovered_via_first_payment: 0,
    cases_2027: [],
  };

  const oldEntryByQv = new Map();

  for (const c of clientsPartial) {
    const ent = resolveClientEntryDate(c, journeyByClient.get(c.id) ?? null);
    const saf = safraFromDate(ent.data_entrada);
    if (c.id) oldEntryByQv.set(c.id, { ...ent, ...saf });
  }

  for (const c of clientes) {
    const id = c.base_qv_id;
    const clientDate = parseDateOnly(c.data_pagamento_entrada);
    const factDate = id ? firstPay.get(id) ?? null : null;

    let payment_entry_date = null;
    let payment_entry_source = null;
    if (factDate) {
      payment_entry_date = factDate;
      payment_entry_source = 'pagamentos_programa.min';
    } else if (clientDate) {
      payment_entry_date = clientDate;
      payment_entry_source = 'clientes.data_pagamento_entrada';
    }

    if (payment_entry_date) paymentAudit.with_payment_date += 1;
    else paymentAudit.without_payment_date += 1;

    const invalid_future = payment_entry_date != null && payment_entry_date > TODAY_ISO;
    if (invalid_future) {
      paymentAudit.future_payment_dates += 1;
      if (paymentAudit.future_cases.length < 50) {
        paymentAudit.future_cases.push({
          base_qv_id: id,
          codigo_cliente: c.codigo_cliente,
          nome: c.nome,
          payment_entry_date,
          payment_entry_source,
          data_pagamento_entrada: clientDate,
          primeiro_pagamento_fato: factDate,
        });
      }
    }

    if (clientDate && factDate && clientDate !== factDate) {
      paymentAudit.conflict_client_vs_fact += 1;
      if (paymentAudit.conflict_cases.length < 30) {
        paymentAudit.conflict_cases.push({
          base_qv_id: id,
          codigo_cliente: c.codigo_cliente,
          clientDate,
          factDate,
        });
      }
    }
    if (!clientDate && factDate) paymentAudit.recovered_from_payments += 1;

    const old = id ? oldEntryByQv.get(id) : null;
    const oldSaf = old?.safra_trimestre ?? null;
    const newSaf =
      payment_entry_date && !invalid_future
        ? quarterFromIso(payment_entry_date)
        : null;

    if (oldSaf) cohortCompare.old_rule[oldSaf] = (cohortCompare.old_rule[oldSaf] ?? 0) + 1;
    else cohortCompare.no_safra_old += 1;

    if (newSaf) cohortCompare.new_rule[newSaf] = (cohortCompare.new_rule[newSaf] ?? 0) + 1;
    else cohortCompare.no_safra_new += 1;

    if (invalid_future) cohortCompare.future_excluded += 1;
    if (oldSaf !== newSaf && (oldSaf || newSaf)) cohortCompare.changed_safra += 1;
    if (factDate && !clientDate) cohortCompare.recovered_via_first_payment += 1;

    if (oldSaf?.startsWith('2027') || newSaf?.startsWith('2027')) {
      cohortCompare.cases_2027.push({
        client_id: id,
        nome: c.nome,
        data_inicio_ciclo: old?.data_entrada ?? null,
        data_pagamento_entrada: clientDate,
        primeiro_pagamento_real: factDate,
        safra_antiga: oldSaf,
        safra_corrigida: newSaf,
        invalid_future_entry_date: invalid_future,
      });
    }
  }

  const npsBySafraNew = {};
  for (const r of base0Nps) {
    const id = r.base_qv_id;
    const cli = clientes.find((c) => c.base_qv_id === id);
    const clientDate = parseDateOnly(cli?.data_pagamento_entrada);
    const factDate = id ? firstPay.get(id) : null;
    const pay = factDate ?? clientDate;
    if (!pay || pay > TODAY_ISO) continue;
    const saf = quarterFromIso(pay);
    if (!saf || saf.startsWith('2027')) continue;
    if (!npsBySafraNew[saf]) npsBySafraNew[saf] = [];
    if (isValidScore(r.nota)) npsBySafraNew[saf].push(Number(r.nota));
  }
  const nps_por_safra_corrigida = Object.fromEntries(
    Object.entries(npsBySafraNew).map(([k, scores]) => [k, npsFromScores(scores)]),
  );

  const reunioesBefore = await tryPostgres(async (pg) => {
    const rows = await pg`
      select base_qv_id, count(*)::int as n
      from base0.reunioes
      where base_qv_id is not null
      group by base_qv_id
    `;
    return new Map(rows.map((r) => [r.base_qv_id, r.n]));
  });

  const mecBefore = await tryPostgres(async (pg) => {
    const rows = await pg`
      select base_qv_id,
        count(*) filter (where status ilike '%conclu%' or status = 'apto')::int as impl
      from base0.mecanismos_cliente
      where base_qv_id is not null
      group by base_qv_id
    `;
    return new Map(rows.map((r) => [r.base_qv_id, r.impl]));
  });

  const tenureBuckets = {};
  const reuniaoBuckets = { '0': [], '1-2': [], '3-5': [], '6+': [] };
  const mecCompare = { com: [], sem: [] };

  for (const r of base0Nps) {
    const id = r.base_qv_id;
    const respDate = parseDateOnly(r.data_resposta);
    if (!respDate || !isValidScore(r.nota)) continue;
    const cli = clientes.find((c) => c.base_qv_id === id);
    const pay = (id && firstPay.get(id)) ?? parseDateOnly(cli?.data_pagamento_entrada);
    if (!pay) continue;
    const days = Math.floor(
      (Date.parse(respDate) - Date.parse(pay)) / (86400 * 1000),
    );
    const bucket = tenureBucket(days);
    if (bucket) {
      if (!tenureBuckets[bucket]) tenureBuckets[bucket] = [];
      tenureBuckets[bucket].push(Number(r.nota));
    }

    const reun = reunioesBefore?.get(id) ?? 0;
    const reunKey =
      reun === 0 ? '0' : reun <= 2 ? '1-2' : reun <= 5 ? '3-5' : '6+';
    reuniaoBuckets[reunKey].push(Number(r.nota));

    const impl = (mecBefore?.get(id) ?? 0) > 0;
    (impl ? mecCompare.com : mecCompare.sem).push(Number(r.nota));
  }

  const nps_por_tenure = Object.fromEntries(
    Object.entries(tenureBuckets).map(([k, s]) => [k, npsFromScores(s)]),
  );
  const nps_por_reunioes = Object.fromEntries(
    Object.entries(reuniaoBuckets).map(([k, s]) => [k, npsFromScores(s)]),
  );
  const nps_mecanismo = {
    com_implementado: npsFromScores(mecCompare.com),
    sem_implementado: npsFromScores(mecCompare.sem),
  };

  const currentByClient = new Map();
  for (const r of responses) {
    if (r.client_id) currentByClient.set(r.client_id, r);
  }

  const overlap = {
    base0_only: 0,
    historico_only: null,
    current_only: 0,
    matched_all: 0,
    ambiguous: 0,
    base0_total: base0Nps.length,
    current_total: responses.length,
    historico_total: histCounts?.historico_respostas ?? null,
    notes:
      'Overlap fino requer chaves comuns; base0 usa base_qv_id, current usa client_id do ingest parcial Set/Pharus.',
  };

  for (const r of base0Nps) {
    const hit = r.base_qv_id && currentByClient.has(r.base_qv_id);
    if (hit) overlap.matched_all += 1;
    else overlap.base0_only += 1;
  }
  for (const r of responses) {
    const id = r.client_id;
    const inB0 = base0Nps.some((x) => x.base_qv_id === id);
    if (!inB0) overlap.current_only += 1;
  }

  const sufficientN = {
    nps_por_safra_corrigida: Object.fromEntries(
      Object.entries(nps_por_safra_corrigida).map(([k, v]) => [k, v.n >= 30]),
    ),
    nps_por_tenure: Object.fromEntries(
      Object.entries(nps_por_tenure).map(([k, v]) => [k, v.n >= 30]),
    ),
    nps_mecanismo: {
      com: nps_mecanismo.com_implementado.n >= 30,
      sem: nps_mecanismo.sem_implementado.n >= 30,
    },
  };

  const why_frozen =
    'Pipeline operacional local (snapshots/latest.json, ingest/partials, processed/responses.json) ' +
    'não foi regerado desde 2026-09-28/29 (raw_snapshot 2026-09-28T21-06-04). ' +
    'BASE QV live já está em 2026-10-06; dashboard Vercel/deploy usa JSON congelado em data/deploy/public. ' +
    'Safras 2027 vêm de resolveClientEntryDate (data_inicio_ciclo/created_at futuros), não de pagamento.';

  const report = {
    generated_at: new Date().toISOString(),
    why_dashboard_appears_frozen_on_28: why_frozen,
    timestamps: {
      last_base_qv_source_at,
      last_ingest_at: localTimestamps.last_ingest_raw_snapshot,
      last_build_at: localTimestamps.last_build_at,
      last_nps_response_at: localTimestamps.last_nps_response_at_local_dataset,
      last_client_update_at: localTimestamps.last_client_update_at_local_ingest,
      base_qv_live_vs_local_gap_days: last_base_qv_source_at
        ? '~8+ dias entre ingest local (set/28) e BASE QV (out/06)'
        : null,
    },
    frozen_datasets: [
      'data/snapshots/latest.json',
      'data/ingest/partials/clients.json',
      'data/processed/responses.json',
      'data/deploy/public/* (espelho do build antigo)',
    ],
    base0_import_run: importRun.data,
    base0_quality: {
      ...base0Quality,
      pagamentos_sem_match: pagSemMatch,
      reembolsos_unicos: base0Quality.reembolsos_omie,
      cotas_unicas: base0Quality.cotas_mecanismos,
    },
    nps_historico_db: histCounts,
    payment_entry_audit: paymentAudit,
    cohort_compare: cohortCompare,
    nps_por_safra_corrigida,
    nps_por_tenure,
    nps_por_reunioes_antes_resposta: nps_por_reunioes,
    nps_mecanismo_antes_resposta: nps_mecanismo,
    nps_overlap: overlap,
    analyses_sufficient_n: sufficientN,
    historico_nps_layout_proposal: {
      priority_sections: [
        'NPS evolução (oficial vs derivado)',
        'Participação / cobertura',
        'Safra pagamento × NPS',
        'Tenure × NPS',
        'Reuniões × NPS',
        'Mecanismos × NPS',
      ],
      collapsible: ['Financeiro', 'Transferências EP', 'Churn/reembolso', 'Qualidade BASE0'],
    },
    stagnation_files: stagnation,
    local_timestamps: localTimestamps,
  };

  const outDir = join(root, 'data/quality');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'cohort_payment_date_audit.json'),
    JSON.stringify(paymentAudit, null, 2),
  );
  writeFileSync(
    join(outDir, 'upgrade_audit_phase0.json'),
    JSON.stringify(report, null, 2),
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
