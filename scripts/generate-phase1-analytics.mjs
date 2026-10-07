#!/usr/bin/env node
/**
 * Fase 1: safras por pagamento + historical_nps_enriched (PIT) + overlap.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
import { buildMilestoneSupplementFromBase0 } from '../lib/analytics/milestone-base0-supplement.mjs';
import { buildNpsMilestoneArtifacts } from '../lib/analytics/nps-milestones-pipeline.mjs';
import { buildNpsAllPeriods } from '../lib/analytics/nps-all-periods.mjs';
import { buildMechanismsAtResponseFromEnriched } from '../lib/analytics/nps-mechanisms-at-response.mjs';
import { buildVocBase0Pack, mergeVocAllPeriods } from '../lib/analytics/voc-base0-pipeline.mjs';
import { readJson } from '../lib/data/file-store.mjs';

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

function runPharusAppMatch() {
  const script = join(root, 'scripts/generate-pharus-app-match.mjs');
  spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
}

function loadAppRowsFromMatch() {
  const doc = readDataJson(root, 'processed/pharus_app_customer_match.json', null);
  if (!doc?.entries?.length) return [];
  const note = doc.app_source ?? 'pharus_app_customer_match.json';
  return doc.entries.map((e) => ({
    client_id: e.client_id,
    has_app: e.has_app,
    has_app_access: e.has_app,
    app_match_status: e.app_match_status,
    app_match_method: e.app_match_method,
    app_registered_at: e.app_registered_at,
    source_note: note,
  }));
}

async function main() {
  runPharusAppMatch();
  const appRows = loadAppRowsFromMatch();

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
    'base_qv_id,codigo_cliente,nome_cliente,programa,data_resposta,nota,categoria,onda,dedupe_key,motivo_nota,comentario_completo',
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
    appRows,
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

  const mechanismEntries = buildMechanismsAtResponseFromEnriched(enrichedPack.enriched);
  await writeJson('processed/nps_mechanisms_at_response.json', {
    meta: {
      pit_rule: 'data_implementacao <= response_date; date_unavailable excluded from buckets',
      source: 'historical_nps_enriched + base0.mecanismos_cliente',
    },
    entries: mechanismEntries,
  });

  const npsAll = buildNpsAllPeriods({ base0Nps, currentResponses });
  npsAll.meta.generated_at = new Date().toISOString();
  npsAll.meta.current_cycle_label = currentResponses[0]?.analytical_cycle_name ?? null;
  await writeJson('processed/nps_all_periods.json', npsAll);
  await writeJson('quality/nps_all_periods_audit.json', npsAll.audit);

  const milestoneSupplement = buildMilestoneSupplementFromBase0({ mecanismos, reunioes });
  const pairedDoc = readDataJson(root, 'processed/paired_cycles.json', null);
  const latestSnap = readDataJson(root, 'snapshots/latest.json', null);
  const milestoneArtifacts = await buildNpsMilestoneArtifacts(currentResponses, {
    rawSnapshotId: latestSnap?.raw_snapshot ?? process.env.MILESTONES_RAW_SNAPSHOT ?? null,
    pairedDoc,
    dataCutoff: latestSnap?.data_cutoff ?? new Date().toISOString(),
    milestoneSupplement,
  });
  await writeJson('processed/nps_client_milestones.json', milestoneArtifacts.clientMilestonesDoc);
  await writeJson('processed/nps_milestones_summary.json', milestoneArtifacts.summaryDoc);
  await writeJson('processed/nps_between_cycle_events.json', milestoneArtifacts.betweenDoc);
  await writeJson('quality/nps_milestones_qa.json', milestoneArtifacts.qaDoc);

  const currentTopics = readDataJson(root, 'processed/response_topics.json', []);

  const { buildNpsChangeDriverArtifacts } = await import('../lib/analytics/nps-change-drivers-pipeline.mjs');
  const changeArtifacts = await buildNpsChangeDriverArtifacts({
    betweenDoc: milestoneArtifacts.betweenDoc,
    clientMilestonesDoc: milestoneArtifacts.clientMilestonesDoc,
    summaryDoc: milestoneArtifacts.summaryDoc,
    pairedDoc,
    responses: currentResponses,
    responseTopics: Array.isArray(currentTopics) ? currentTopics : [],
    dataCutoff: latestSnap?.data_cutoff ?? new Date().toISOString(),
  });
  await writeJson('processed/nps_change_drivers.json', changeArtifacts.driversDoc);
  await writeJson('quality/nps_change_drivers_qa.json', changeArtifacts.qaDoc);

  const cyclesDoc = readDataJson(root, 'processed/cycles.json', []);
  const vocBase0 = buildVocBase0Pack({
    base0Nps,
    currentResponses,
    cycles: cyclesDoc,
    dataCutoff: latestSnap?.data_cutoff ?? new Date().toISOString(),
  });
  await writeJson('quality/voc_base0_coverage.json', vocBase0.audit);
  const vocMerged = mergeVocAllPeriods({
    currentTopics: Array.isArray(currentTopics) ? currentTopics : [],
    base0Topics: vocBase0.responseTopics,
    audit: vocBase0.audit,
  });
  await writeJson('processed/voc_all_periods.json', vocMerged);

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
        nps_all_periods: npsAll.audit,
        mechanisms_at_response: mechanismEntries.length,
        milestones_mecanismos_loaded:
          milestoneArtifacts.clientMilestonesDoc.meta.sources_loaded?.['client_mecanismos.json'],
        voc_base0: vocBase0.audit,
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
