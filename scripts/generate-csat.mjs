/**
 * Regenera artefatos CSAT (SELECT BASE QV ou snapshot raw).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  createBaseQvClient,
  fetchCsatResponses,
  fetchClientsByIds,
  fetchTransferLogsByClientIds,
  fetchEpDirectory,
} from '../lib/data/base-qv.mjs';
import { loadAnalyticalCycleConfig } from '../lib/analytics/analytical-cycles.mjs';
import {
  buildCsatResponsesProcessed,
  buildCsatSummary,
  buildClientSatisfactionSummary,
  buildCsatLegacyReconciliation,
} from '../lib/analytics/csat-pipeline.mjs';

dotenv.config();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readProcessed = (name) => JSON.parse(readFileSync(join(root, 'data/processed', name), 'utf8'));

const analyticalConfig = loadAnalyticalCycleConfig();
const npsResponses = readProcessed('responses.json');
const sourceCycles = readProcessed('cycles.json');
const eligible = readProcessed('eligible_clients.json');
const cycleSummary = readProcessed('cycle_summary.json');
const dataCutoff = cycleSummary.data_cutoff ?? new Date().toISOString();

const importExportPath = join(root, 'data/imports/csat_responses_export.json');
let csatSource;
let clientsFromExport = null;
if (existsSync(importExportPath)) {
  try {
    const imported = JSON.parse(readFileSync(importExportPath, 'utf8'));
    csatSource = imported.map(({ _client, ...row }) => row);
    clientsFromExport = new Map();
    for (const row of imported) {
      if (row.client_id && row._client) {
        clientsFromExport.set(row.client_id, {
          id: row.client_id,
          codigo: row._client.codigo,
          name: row._client.name ?? row.client_name,
          programa: row._client.programa,
          engenheiro_patrimonial: row._client.engenheiro_patrimonial,
          engenheiros_anteriores: [],
        });
      }
    }
  } catch {
    csatSource = null;
  }
}
const ingest = process.env.ANALYTICS_INGEST_SNAPSHOT;
const ingestCsatPath = ingest ? join(root, 'data/raw', ingest, 'csat_responses.json') : null;
if (!csatSource && ingestCsatPath) {
  try {
    csatSource = JSON.parse(readFileSync(ingestCsatPath, 'utf8'));
  } catch {
    csatSource = null;
  }
}
if (!csatSource) {
  const savedIngest = process.env.ANALYTICS_INGEST_SNAPSHOT;
  delete process.env.ANALYTICS_INGEST_SNAPSHOT;
  const baseQv = createBaseQvClient();
  csatSource = await fetchCsatResponses(baseQv);
  if (savedIngest) process.env.ANALYTICS_INGEST_SNAPSHOT = savedIngest;
}

const clientIds = [...new Set(csatSource.map((r) => r.client_id).filter(Boolean))];
let clientsMap = clientsFromExport;
let transferMap;
let epNameToId;
if (clientsMap?.size) {
  transferMap = new Map();
  epNameToId = new Map();
} else if (ingest) {
  const clientsList = JSON.parse(
    readFileSync(join(root, 'data/raw', ingest, 'clients.json'), 'utf8'),
  );
  clientsMap = new Map(clientsList.map((c) => [c.id, c]));
} else {
  const baseQv = createBaseQvClient();
  [clientsMap, transferMap, epNameToId] = await Promise.all([
    fetchClientsByIds(baseQv, clientIds),
    fetchTransferLogsByClientIds(baseQv, clientIds),
    fetchEpDirectory(baseQv),
  ]);
}
if (!transferMap || !epNameToId) {
  const savedIngest = process.env.ANALYTICS_INGEST_SNAPSHOT;
  delete process.env.ANALYTICS_INGEST_SNAPSHOT;
  const baseQv = createBaseQvClient();
  [transferMap, epNameToId] = await Promise.all([
    fetchTransferLogsByClientIds(baseQv, clientIds),
    fetchEpDirectory(baseQv),
  ]);
}

const { rows: csatResponses, quality } = buildCsatResponsesProcessed(
  csatSource,
  clientsMap,
  epNameToId,
  transferMap,
  analyticalConfig,
  sourceCycles,
  sourceCycles,
);

const eligibleByCycle = new Map();
for (const e of eligible) {
  if (!e.analytical_cycle_code) continue;
  eligibleByCycle.set(e.analytical_cycle_code, {
    eligible_clients: (eligibleByCycle.get(e.analytical_cycle_code)?.eligible_clients ?? 0) + 1,
  });
}

const csatSummary = buildCsatSummary(csatResponses, eligibleByCycle, dataCutoff);
const clientSat = buildClientSatisfactionSummary(csatResponses, npsResponses);
const reconciliation = buildCsatLegacyReconciliation(csatResponses);

const qualityDoc = {
  entries: quality.map((q) => ({ ...q, refresh_run_id: 'generate-csat' })),
};

writeFileSync(
  join(root, 'data/processed/csat_responses.json'),
  JSON.stringify(csatResponses, null, 2) + '\n',
  'utf8',
);
writeFileSync(
  join(root, 'data/processed/csat_summary.json'),
  JSON.stringify(csatSummary, null, 2) + '\n',
  'utf8',
);
writeFileSync(
  join(root, 'data/processed/client_satisfaction_summary.json'),
  JSON.stringify(clientSat, null, 2) + '\n',
  'utf8',
);
writeFileSync(
  join(root, 'data/quality/csat_legacy_reconciliation.json'),
  JSON.stringify(reconciliation, null, 2) + '\n',
  'utf8',
);

console.log(
  `CSAT — ${csatResponses.length} respostas; média global ${reconciliation.csat_average?.toFixed(2)}; satisfeitos ${reconciliation.satisfied_pct?.toFixed(1)}%; qualidade ${quality.length} avisos`,
);
