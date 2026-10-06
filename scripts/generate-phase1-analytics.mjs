#!/usr/bin/env node
/**
 * Fase 1: safras por pagamento + historical_nps_enriched (PIT) + overlap.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import { writeJson } from '../lib/data/file-store.mjs';
import { createBusinessDataClient } from '../lib/persistence/business-data-client.mjs';
import {
  loadPaymentEntryContext,
  fetchAllPaginated,
  PAYMENT_ENTRY_RULE,
} from '../lib/analytics/payment-entry-date.mjs';
import { buildCustomerNpsCohortsDataset } from '../lib/analytics/customer-nps-cohorts.mjs';
import { buildHistoricoNpsArtifacts } from '../lib/analytics/historico-nps-build.mjs';
import {
  buildHistoricalNpsEnriched,
  buildNpsOverlapReport,
} from '../lib/analytics/historical-nps-enriched.mjs';
import { readDataJson, historicoCsvCandidates } from '../lib/deploy/build-input.mjs';
import { HISTORICO_OFFICIAL_MEDICOES } from '../lib/analytics/customer-nps-cohorts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

const CURRENT_DATE = process.env.ANALYTICS_AS_OF_DATE ?? '2026-10-06';

function loadHistoricoCsv() {
  const candidates = historicoCsvCandidates(root);
  const path = candidates.find((p) => existsSync(p));
  if (!path) return [];
  const wb = XLSX.readFile(path, { type: 'file' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}

function indexByClient(rows, key = 'base_qv_id') {
  const m = new Map();
  for (const r of rows) {
    const id = r[key];
    if (!id) continue;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(r);
  }
  return m;
}

async function loadHistoricoDbRows() {
  try {
    const { connectBase0 } = await import('../lib/base0/db.mjs');
    const pg = connectBase0();
    const rows = await pg`select id, client_id, data_resposta, nota, onda from nps_historico.respostas limit 50000`;
    await pg.end({ timeout: 5 });
    return rows;
  } catch {
    return null;
  }
}

async function main() {
  const sb = createBusinessDataClient('base0');
  const { byClientId, audit, conflicts } = await loadPaymentEntryContext(sb, CURRENT_DATE);

  await writeJson('quality/cohort_payment_date_audit.json', {
    ...audit,
    dedupe_rule: PAYMENT_ENTRY_RULE,
    conflict_details: conflicts,
    as_of: CURRENT_DATE,
  });
  await writeJson('quality/payment_entry_conflicts.json', conflicts);

  const [reunioes, mecanismos, transferencias, pagamentos, reembolsos, acordos] =
    await Promise.all([
      fetchAllPaginated(sb, 'reunioes', 'base_qv_id,inicio_brasilia,tipo_reuniao,nome_evento'),
      fetchAllPaginated(
        sb,
        'mecanismos_cliente',
        'base_qv_id,status,data_implementacao,data_real,mecanismo_nome',
      ),
      fetchAllPaginated(sb, 'transferencias_ep', 'base_qv_id,data_troca,ep_anterior,ep_novo,ordem'),
      fetchAllPaginated(
        sb,
        'pagamentos_programa',
        'base_qv_id,data_pagamento,valor,conta_como_programa',
      ),
      fetchAllPaginated(sb, 'reembolsos_omie', 'base_qv_id,vencimento,previsao_pagamento,valor'),
      fetchAllPaginated(sb, 'acordos_reembolso', 'base_qv_id,data_primeiro_pagamento,valor_total_acordo'),
    ]);

  const base0Nps = await fetchAllPaginated(
    sb,
    'nps_respostas',
    'base_qv_id,codigo_cliente,nome_cliente,data_resposta,nota,categoria,onda,dedupe_key',
  );

  const clientesBase0 = await fetchAllPaginated(
    sb,
    'clientes',
    'base_qv_id,nome,programa,ep,data_churn,data_pagamento_entrada',
  );
  const clientesById = new Map(clientesBase0.map((c) => [c.base_qv_id, c]));

  const clients =
    readDataJson(root, 'ingest/partials/clients.json') ??
    readDataJson(root, 'processed/clients.json') ??
    [];
  const journeys = readDataJson(root, 'ingest/partials/client_journeys.json', []);
  const cancellations = readDataJson(root, 'ingest/partials/cancellations.json', []);
  const freezeRows = readDataJson(root, 'ingest/partials/freeze_change_requests.json', []);
  const currentResponses = readDataJson(root, 'processed/responses.json', []);
  const eps = readDataJson(root, 'ingest/partials/engenheiros_patrimoniais.json', []);
  const historicoResponses = loadHistoricoCsv();
  const epNameById = new Map((eps ?? []).map((e) => [e.id, e.name]));

  const built = buildCustomerNpsCohortsDataset({
    clients,
    journeys,
    cancellations,
    freezeRows,
    currentResponses,
    historicoResponses,
    appRows: [],
    epNameById,
    paymentEntryByClientId: byClientId,
  });

  built.audit.payment_entry_rule = PAYMENT_ENTRY_RULE;
  built.audit.cohort_payment_as_of = CURRENT_DATE;

  await writeJson('processed/customer_nps_cohorts.json', built.customers);
  await writeJson('processed/customer_nps_history.json', built.history);
  await writeJson('processed/safras_cobertura_summaries.json', built.summaries);
  await writeJson('quality/safras_cobertura_audit.json', built.audit);

  const artifacts = buildHistoricoNpsArtifacts({
    currentResponses,
    historicoResponses,
    clients,
    cohorts: built.customers,
    audit: built.audit,
  });

  await writeJson('processed/historical_nps_summary.json', {
    meta: { ...artifacts.meta, official_medicoes: HISTORICO_OFFICIAL_MEDICOES },
    summary: artifacts.summary,
    form_versions: artifacts.form_versions,
  });
  await writeJson('processed/historical_nps_responses.json', { responses: artifacts.responses });
  await writeJson('processed/historical_nps_clients.json', { clients: artifacts.clients });
  await writeJson('processed/historical_nps_field_coverage.json', artifacts.field_coverage);

  const unifiedResponses = artifacts.responses.map((r) => ({
    ...r,
    client_id: r.client_id,
    data_resposta: r.data_resposta,
    nota_nps: r.nota_nps,
    ciclo: r.ciclo,
    response_key: r.response_key,
    source: r.source,
  }));

  const enrichedPack = buildHistoricalNpsEnriched({
    responses: unifiedResponses,
    paymentByClient: byClientId,
    meetingsByClient: indexByClient(reunioes),
    mecanismosByClient: indexByClient(mecanismos),
    transfersByClient: indexByClient(transferencias),
    pagamentosByClient: indexByClient(pagamentos),
    reembolsosByClient: indexByClient(reembolsos),
    acordosByClient: indexByClient(acordos),
    clientesById,
    currentDateIso: CURRENT_DATE,
  });

  const historicoDb = await loadHistoricoDbRows();
  const overlap = buildNpsOverlapReport({
    base0Nps,
    historicoRows: historicoDb,
    currentRows: currentResponses,
  });

  const cases2027 = built.customers.filter((c) =>
    String(c.safra_trimestre ?? '').startsWith('2027'),
  );

  const manualQaClients = [
    'Pedro Sesar Junior',
    'Pollyana Cristina',
    'Rafael Baima de Melo Lima',
  ].map((name) => {
    const c = built.customers.find((x) => (x.client_name ?? '').trim() === name);
    const pay = c ? byClientId.get(c.client_id) : null;
    return { name, client_id: c?.client_id, safra: c?.safra_trimestre, payment: pay };
  });

  await writeJson('processed/historical_nps_enriched.json', {
    meta: {
      generated_at: enrichedPack.generated_at,
      as_of: CURRENT_DATE,
      payment_entry_rule: PAYMENT_ENTRY_RULE,
      pit_rule: 'event_date <= response_date (end of day UTC)',
    },
    responses: enrichedPack.enriched,
    analyses: enrichedPack.analyses,
    overlap,
    qa_2027_cases: cases2027,
    manual_qa_sample: manualQaClients,
  });
  await writeJson('quality/historical_nps_enriched_quality.json', enrichedPack.quality);

  const safraDist = {};
  for (const c of built.customers) {
    if (c.invalid_future_entry_date || !c.safra_trimestre) continue;
    if (c.safra_trimestre.startsWith('2027')) continue;
    safraDist[c.safra_trimestre] = (safraDist[c.safra_trimestre] ?? 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        cohorts: built.customers.length,
        enriched: enrichedPack.enriched.length,
        safras_2027_remaining: cases2027.length,
        safra_distribution: safraDist,
        overlap,
        analyses_keys: Object.keys(enrichedPack.analyses),
        payment_audit: {
          with_payment_date: audit.with_payment_date,
          conflicts: audit.conflict_client_vs_fact,
          future: audit.future_payment_dates,
        },
        official_nps_preserved: HISTORICO_OFFICIAL_MEDICOES.map((m) => m.ciclo),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
