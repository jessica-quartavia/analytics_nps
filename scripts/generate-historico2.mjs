#!/usr/bin/env node
/**
 * Histórico 2 — BASE QV (atributos + NPS) + BASE0 (somente data_entrada).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { writeJson } from '../lib/data/file-store.mjs';
import { readDataJson } from '../lib/deploy/build-input.mjs';
import { createBusinessDataClient } from '../lib/persistence/business-data-client.mjs';
import { fetchAllPaginated } from '../lib/analytics/payment-entry-date.mjs';
import { loadPharusClientIdentifiers } from '../lib/pharus/base-identifiers.mjs';
import { buildHistorico2Dataset } from '../lib/analytics/historico2-entry-date-match.mjs';
import {
  buildNpsHistoricoMeasurements,
  enrichMeasurementAuditWithCycles,
  MEASUREMENT_DEDUPE_RULE,
  MEASUREMENT_SOURCE,
} from '../lib/analytics/nps-historico-measurements.mjs';
import { buildNpsHistoricoBase0MatchAudit } from '../lib/analytics/nps-historico-base0-match-audit.mjs';
import { loadBaseQvResponsesForMeasurements } from '../lib/analytics/nps-historico-response-loader.mjs';
import { sha256Json } from '../lib/analytics/nps-historico-measurements-hash.mjs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function fileSha256(absPath) {
  try {
    const buf = readFileSync(absPath);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}
dotenv.config({ path: join(root, '.env') });

const AS_OF = process.env.ANALYTICS_AS_OF_DATE ?? new Date().toISOString().slice(0, 10);

async function loadBase0Clientes() {
  const sb = createBusinessDataClient('base0');
  return fetchAllPaginated(
    sb,
    'clientes',
    'base_qv_id,codigo_cliente,cpf_norm,email_norm,telefone_norm,email,telefone,cpf_raw,data_entrada,programa',
  );
}

export async function generateHistorico2Pack() {
  const clientsRaw =
    readDataJson(root, 'ingest/partials/clients.json') ??
    readDataJson(root, 'processed/clients.json') ??
    [];
  const pharusClients = clientsRaw.filter(
    (c) => (c.programa ?? c.program ?? '').toUpperCase() === 'PHARUS',
  );
  const { entries: identifiers } = await loadPharusClientIdentifiers();
  const identById = new Map(identifiers.map((e) => [e.client_id, e]));

  const baseQvClients = pharusClients.map((c) => {
    const id = c.id ?? c.client_id;
    const ident = identById.get(id) ?? {};
    return {
      ...c,
      id,
      email: ident.email ?? null,
      cpf: ident.cpf ?? null,
      phone: ident.phone ?? null,
    };
  });

  const npsResponsesProcessed = readDataJson(root, 'processed/responses.json', []);
  const npsResponses = await loadBaseQvResponsesForMeasurements(root);

  let base0Rows = [];
  try {
    base0Rows = await loadBase0Clientes();
  } catch (err) {
    console.warn('[historico2] base0.clientes indisponível:', err.message ?? err);
  }

  const pack = buildHistorico2Dataset({
    baseQvClients,
    base0Rows,
    npsResponses: npsResponsesProcessed,
    asOfDate: AS_OF,
  });

  const pharusIds = new Set(pack.clients.map((c) => c.client_id));
  const measurements = buildNpsHistoricoMeasurements(npsResponses, { clientIds: pharusIds });
  const cycles = readDataJson(root, 'processed/cycles.json', []) ?? [];
  const measurementAuditTable = enrichMeasurementAuditWithCycles(
    measurements.per_cycle_audit,
    cycles,
  );
  const base0MatchAudit = buildNpsHistoricoBase0MatchAudit({ baseQvClients, base0Rows });
  const buildCommit = gitHead();
  const generatedAt = pack.meta.generated_at;
  const datasetVersion = buildCommit
    ? `nps-historico-${buildCommit.slice(0, 12)}`
    : `nps-historico-${generatedAt}`;

  pack.meta = {
    ...pack.meta,
    page_key: 'nps-historico',
    page_title: 'NPS Histórico',
    dataset_version: datasetVersion,
    build_commit: buildCommit,
    responses_source: 'BASE_QV:nps_responses (>=2025-01-01) + processed/responses.json',
    measurements_responses_rows: npsResponses.length,
    responses_source_max_updated_at: generatedAt,
    measurement_dedupe_rule: MEASUREMENT_DEDUPE_RULE,
  };

  pack.measurements = {
    meta: {
      source: measurements.source,
      dedupe_rule: measurements.dedupe_rule,
      universe: 'PHARUS client_id from historico2 pack',
    },
    series: measurements.series,
    response_index: measurements.response_index,
  };

  await writeJson('processed/historico2_clients_enriched.json', pack);

  const responsesPath = join(root, 'data/processed/responses.json');
  await writeJson('quality/nps_historico_measurements_audit.json', {
    generated_at: generatedAt,
    dataset_version: datasetVersion,
    build_commit: buildCommit,
    source: measurements.source,
    dedupe_rule: measurements.dedupe_rule,
    measurement_counts: measurements.series,
    per_cycle_audit: measurementAuditTable,
    measurement_audit_table: measurementAuditTable,
    qa_samples: {
      '2026-Q1': measurements.response_index.filter((r) => r.measurement === '2026-Q1'),
      '2026-Q2': measurements.response_index.filter((r) => r.measurement === '2026-Q2').slice(0, 5),
      '2026-Q3': measurements.response_index.filter((r) => r.measurement === '2026-Q3').slice(0, 5),
    },
    file_hashes: {
      'processed/responses.json': fileSha256(responsesPath),
      'processed/historico2_clients_enriched.json': sha256Json({
        meta: pack.meta,
        measurements: pack.measurements,
        clients_count: pack.clients.length,
      }),
    },
  });
  try {
    const { generateNpsMeasurementsBaseQv } = await import('./generate-nps-measurements-baseqv.mjs');
    await generateNpsMeasurementsBaseQv();
    const { generateNpsMeasurementsConsolidated } = await import(
      './generate-nps-measurements-consolidated.mjs'
    );
    await generateNpsMeasurementsConsolidated();
    const { generateNpsCrossPageAudit } = await import('./generate-nps-cross-page-audit.mjs');
    await generateNpsCrossPageAudit();
  } catch (err) {
    console.warn('[historico2] nps measurements packs skipped:', err.message ?? err);
  }

  await writeJson('quality/nps_historico_base0_match_audit.json', {
    generated_at: pack.meta.generated_at,
    dataset_version: datasetVersion,
    build_commit: buildCommit,
    ...base0MatchAudit,
    matched_by_id: pack.audit.by_method.base_qv_id ?? 0,
    matched_by_cpf: pack.audit.by_method.cpf ?? 0,
    matched_by_email: pack.audit.by_method.email ?? 0,
    matched_by_phone: pack.audit.by_method.phone ?? 0,
    unmatched: pack.audit.by_method.unmatched ?? 0,
    ambiguous: pack.audit.by_method.ambiguous ?? 0,
    conflicting_entry_dates: base0MatchAudit.conflicting_entry_dates,
    reason_breakdown: {
      base0_base_qv_id_null: base0MatchAudit.base0_base_qv_id_null,
      base0_base_qv_id_invalid_uuid: base0MatchAudit.base0_base_qv_id_invalid_uuid,
      base0_id_not_in_base_qv: base0MatchAudit.base0_ids_not_in_base_qv,
      base_qv_clients_unmatched: pack.audit.by_method.unmatched ?? 0,
      base_qv_clients_ambiguous: pack.audit.by_method.ambiguous ?? 0,
    },
  });

  await writeJson('quality/historico2_entry_date_match_audit.json', {
    generated_at: pack.meta.generated_at,
    as_of_date: pack.meta.as_of_date,
    base_qv_total: pack.audit.base_qv_total,
    matched_total: pack.audit.matched_total,
    with_entry_date: pack.audit.with_entry_date,
    without_entry_date: pack.audit.without_entry_date,
    coverage_pct: pack.audit.coverage_pct,
    by_method: pack.audit.by_method,
    unmatched: pack.audit.by_method.unmatched ?? 0,
    ambiguous: pack.audit.by_method.ambiguous ?? 0,
    conflicts: pack.audit.conflicts,
    base0_duplicate_audit: pack.audit.base0_duplicate_audit,
    future_entry_dates: pack.audit.future_entry_dates,
    qa_samples: pack.audit.qa_samples,
    kpis: pack.kpis,
  });

  return pack;
}

async function main() {
  const pack = await generateHistorico2Pack();
  console.log(
    JSON.stringify(
      {
        clients: pack.clients.length,
        coverage_pct: pack.audit.coverage_pct,
        by_method: pack.audit.by_method,
        cohorts: pack.cohort_summaries.length,
        nps_responses: pack.kpis.nps_responses_considered,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
