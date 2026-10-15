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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

  const npsResponses = readDataJson(root, 'processed/responses.json', []);

  let base0Rows = [];
  try {
    base0Rows = await loadBase0Clientes();
  } catch (err) {
    console.warn('[historico2] base0.clientes indisponível:', err.message ?? err);
  }

  const pack = buildHistorico2Dataset({
    baseQvClients,
    base0Rows,
    npsResponses,
    asOfDate: AS_OF,
  });

  await writeJson('processed/historico2_clients_enriched.json', pack);
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
