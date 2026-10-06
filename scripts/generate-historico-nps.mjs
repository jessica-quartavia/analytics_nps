/**
 * Gera datasets consolidados histórico + atual (dedupe: atual vence).
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { writeJson } from '../lib/data/file-store.mjs';
import { buildCustomerNpsCohortsDataset } from '../lib/analytics/customer-nps-cohorts.mjs';
import { buildHistoricoNpsArtifacts } from '../lib/analytics/historico-nps-build.mjs';
import { readDataJson, historicoCsvCandidates } from '../lib/deploy/build-input.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

function loadHistoricoCsv() {
  const candidates = historicoCsvCandidates(root);
  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    console.warn('[generate:historico-nps] CSV histórico ausente');
    return [];
  }
  const wb = XLSX.readFile(path, { type: 'file' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
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

  const built = buildCustomerNpsCohortsDataset({
    clients,
    journeys,
    cancellations,
    freezeRows,
    currentResponses,
    historicoResponses,
    appRows: [],
    epNameById,
  });

  const artifacts = buildHistoricoNpsArtifacts({
    currentResponses,
    historicoResponses,
    clients,
    cohorts: built.customers,
    audit: built.audit,
  });

  await writeJson('processed/historical_nps_summary.json', {
    meta: artifacts.meta,
    summary: artifacts.summary,
    form_versions: artifacts.form_versions,
  });
  await writeJson('processed/historical_nps_responses.json', {
    responses: artifacts.responses,
  });
  await writeJson('processed/historical_nps_clients.json', {
    clients: artifacts.clients,
  });
  await writeJson('processed/historical_nps_field_coverage.json', artifacts.field_coverage);

  console.log(
    JSON.stringify(
      {
        historico_input: artifacts.meta.historico_input,
        current_input: artifacts.meta.current_input,
        after_dedupe: artifacts.meta.after_dedupe,
        cycles: artifacts.summary.cycles.length,
        unique_clients: artifacts.meta.unique_clients,
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
