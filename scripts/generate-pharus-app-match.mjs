#!/usr/bin/env node
/**
 * Matching App PHARUS (server-side). Requer PHARUS_SUPABASE_* no .env.
 * Fallback: preserva artefato anterior se conexão falhar e já houver matches válidos.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson, readJson } from '../lib/data/file-store.mjs';
import { matchClientsToApp } from '../lib/analytics/pharus-app-match.mjs';
import {
  getPharusSupabaseConfig,
  loadProjectDotenv,
  logPharusEnvStatus,
  pharusProjectRef,
} from '../lib/pharus/env.mjs';
import { loadPharusClientIdentifiers } from '../lib/pharus/base-identifiers.mjs';
import { fetchPharusAppCadastro } from '../lib/pharus/app-cadastro.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'processed/pharus_app_customer_match.json';
const AUDIT = 'quality/pharus_app_match_audit.json';
const PREV_MATCH = join(root, 'data', OUT);
const PREV_AUDIT = join(root, 'data', AUDIT);

function readPreviousAudit() {
  try {
    if (existsSync(PREV_AUDIT)) {
      return JSON.parse(readFileSync(PREV_AUDIT, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function shouldPreservePrevious(appFetch, prevAudit) {
  if (appFetch.records?.length > 0) return false;
  const prevMatched = prevAudit?.matched_clients ?? 0;
  if (prevMatched <= 0) return false;
  if (!appFetch.configured) return false;
  return Boolean(appFetch.error || appFetch.source === 'no_table');
}

async function main() {
  loadProjectDotenv();
  const cfg = logPharusEnvStatus();
  const prevAudit = readPreviousAudit();

  const { entries: baseClients, audit: idAudit } = await loadPharusClientIdentifiers();

  let appFetch;
  try {
    appFetch = await fetchPharusAppCadastro(cfg);
    appFetch.configured = cfg.configured;
  } catch (e) {
    appFetch = {
      records: [],
      source: 'error',
      error: e.message ?? String(e),
      configured: cfg.configured,
      column_mapping: null,
      tables_probed: [],
    };
  }

  if (shouldPreservePrevious(appFetch, prevAudit)) {
    console.warn('[pharus-app-match] App indisponível — preservando artefato anterior com matches.');
    return;
  }

  if (!appFetch.records.length && cfg.configured) {
    console.warn('[pharus-app-match]', appFetch.error ?? 'sem registros App');
  }

  const { entries, audit: matchAudit } = matchClientsToApp(baseClients, appFetch.records);

  const report = {
    generated_at: new Date().toISOString(),
    pharus_project_ref: cfg.url ? pharusProjectRef(cfg.url) : null,
    app_source: appFetch.source,
    app_table_column_mapping: appFetch.column_mapping ?? null,
    tables_probed: appFetch.tables_probed ?? [],
    app_records: appFetch.records.length,
    base_clients: baseClients.length,
    base_identifier_audit: idAudit,
    matched_clients: matchAudit.matched_clients,
    unmatched_clients: matchAudit.unmatched_clients,
    ambiguous_clients: matchAudit.ambiguous_clients,
    insufficient_identifiers: matchAudit.insufficient_identifiers,
    match_by_cpf: matchAudit.match_by_cpf,
    match_by_email: matchAudit.match_by_email,
    match_by_phone: matchAudit.match_by_phone,
    match_by_multiple: matchAudit.match_by_multiple,
    coverage_pct:
      baseClients.length > 0
        ? Math.round((1000 * matchAudit.matched_clients) / baseClients.length) / 10
        : null,
    warning: appFetch.error,
    qa_samples: {
      matched_cpf: entries.filter((e) => e.app_match_method === 'cpf').slice(0, 5).map((e) => e.client_id),
      matched_email: entries.filter((e) => e.app_match_method === 'email').slice(0, 5).map((e) => e.client_id),
      matched_phone: entries.filter((e) => e.app_match_method === 'phone').slice(0, 5).map((e) => e.client_id),
      matched_multiple: entries.filter((e) => e.app_match_method === 'multiple').slice(0, 5).map((e) => e.client_id),
      unmatched: entries.filter((e) => e.app_match_status === 'unmatched').slice(0, 5).map((e) => e.client_id),
      ambiguous: entries.filter((e) => e.app_match_status === 'ambiguous').slice(0, 5).map((e) => e.client_id),
    },
  };

  await writeJson(OUT, {
    generated_at: report.generated_at,
    app_source: appFetch.source,
    entries,
  });
  await writeJson(AUDIT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
