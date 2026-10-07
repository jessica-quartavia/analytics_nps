/**
 * Gera datasets derivados: customer_nps_cohorts, customer_nps_history, audit.
 * Fontes: ingest partials / raw snapshot, responses.json, CSV histórico PHARUS.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { writeJson } from '../lib/data/file-store.mjs';
import { buildCustomerNpsCohortsDataset } from '../lib/analytics/customer-nps-cohorts.mjs';
import { readDataJson, historicoCsvCandidates } from '../lib/deploy/build-input.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

function loadHistoricoCsv() {
  const candidates = historicoCsvCandidates(root);
  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    console.warn(
      '[generate:safras-cobertura] CSV histórico ausente — use data/deploy/sources/NPS_PHARUS_consolidado.csv',
    );
    return [];
  }
  const wb = XLSX.readFile(path, { type: 'file' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function loadAppMatchRows() {
  const doc = readDataJson(root, 'processed/pharus_app_customer_match.json', null);
  const entries = doc?.entries ?? [];
  return {
    rows: entries.map((e) => ({
      ...e,
      has_app_access: e.has_app,
      source_note: doc?.app_source ?? 'pharus_app_customer_match.json',
    })),
    note: doc?.app_source ?? (entries.length ? 'pharus_app_customer_match.json' : 'not_configured'),
  };
}

async function main() {
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
  const appProbe = loadAppMatchRows();

  const built = buildCustomerNpsCohortsDataset({
    clients,
    journeys,
    cancellations,
    freezeRows,
    currentResponses,
    historicoResponses,
    appRows: appProbe.rows,
    epNameById,
  });

  built.audit.app_source = appProbe.note;

  await writeJson('processed/customer_nps_cohorts.json', built.customers);
  await writeJson('processed/customer_nps_history.json', built.history);
  await writeJson('processed/safras_cobertura_summaries.json', built.summaries);
  await writeJson('quality/safras_cobertura_audit.json', built.audit);

  console.log(
    JSON.stringify(
      {
        customers: built.customers.length,
        history_rows: built.history.length,
        ever_answered: built.audit.ever_answered_nps,
        never_answered: built.audit.never_answered_nps,
        app_source: built.audit.app_source,
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
