#!/usr/bin/env node
/**
 * Matching App PHARUS (server-side). Requer PHARUS_SUPABASE_* no .env.
 * Fallback: preserva artefato anterior (data/ ou bundle deploy/public) se env/conexão falhar.
 */
import { writeJson } from '../lib/data/file-store.mjs';
import { readDataJson } from '../lib/deploy/build-input.mjs';
import { matchClientsToApp } from '../lib/analytics/pharus-app-match.mjs';
import {
  getPharusSupabaseConfig,
  loadProjectDotenv,
  logPharusEnvStatus,
  pharusProjectRef,
} from '../lib/pharus/env.mjs';
import { loadPharusClientIdentifiers } from '../lib/pharus/base-identifiers.mjs';
import { fetchPharusAppCadastro } from '../lib/pharus/app-cadastro.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'processed/pharus_app_customer_match.json';
const AUDIT = 'quality/pharus_app_match_audit.json';

function readPreviousBundle() {
  const audit = readDataJson(root, AUDIT, null);
  const match = readDataJson(root, OUT, null);
  return { audit, match };
}

function previousMatchedCount(prev) {
  const fromAudit = prev.audit?.matched_clients;
  if (typeof fromAudit === 'number' && fromAudit > 0) return fromAudit;
  const entries = prev.match?.entries;
  if (!Array.isArray(entries)) return 0;
  return entries.filter((e) => e.has_app || e.app_match_status === 'matched').length;
}

function shouldPreservePrevious(appFetch, prevMatched) {
  if (appFetch.records?.length > 0) return false;
  if (prevMatched <= 0) return false;
  if (!appFetch.configured) return true;
  return Boolean(
    appFetch.error ||
      appFetch.source === 'no_table' ||
      appFetch.source === 'not_configured' ||
      appFetch.source === 'error',
  );
}

async function main() {
  loadProjectDotenv();
  const cfg = logPharusEnvStatus();
  const prev = readPreviousBundle();
  const prevMatched = previousMatchedCount(prev);

  const { entries: baseClients, audit: idAudit } = await loadPharusClientIdentifiers();

  let appFetch;
  if (!cfg.configured) {
    appFetch = {
      records: [],
      source: 'not_configured',
      error: 'PHARUS_SUPABASE_URL / PHARUS_SUPABASE_SERVICE_ROLE_KEY ausentes',
      configured: false,
      column_mapping: null,
      tables_probed: [],
    };
  } else {
    try {
      appFetch = await fetchPharusAppCadastro(cfg);
      appFetch.configured = true;
    } catch (e) {
      appFetch = {
        records: [],
        source: 'error',
        error: e.message ?? String(e),
        configured: true,
        column_mapping: null,
        tables_probed: [],
      };
    }
  }

  if (shouldPreservePrevious(appFetch, prevMatched)) {
    console.warn(
      `[pharus-app-match] App indisponível ou não configurado — preservando bundle anterior (matched≈${prevMatched}).`,
    );
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
      matched_multiple: entries
        .filter((e) => e.app_match_method === 'multiple')
        .slice(0, 5)
        .map((e) => e.client_id),
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
  console.error('[pharus-app-match]', e.message ?? e);
  process.exit(0);
});
