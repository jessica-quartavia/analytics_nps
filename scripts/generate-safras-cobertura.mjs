/**
 * Gera datasets derivados: customer_nps_cohorts, customer_nps_history, audit.
 * Fontes: ingest partials / raw snapshot, responses.json, CSV histórico PHARUS.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeJson } from '../lib/data/file-store.mjs';
import {
  buildCustomerNpsCohortsDataset,
  normalizeNameKey,
} from '../lib/analytics/customer-nps-cohorts.mjs';
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

async function probeAppPharus(clients) {
  const url = process.env.ANALYTICS_NPS_SUPABASE_URL;
  const key = process.env.ANALYTICS_NPS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.includes('rckp') || !key) return { rows: [], note: 'Business Data env ausente' };

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const candidates = [
    { schema: 'clusterizacao_pharus', table: 'usuarios' },
    { schema: 'clusterizacao_pharus', table: 'usuarios_app' },
    { schema: 'clusterizacao_pharus', table: 'app_usuarios' },
    { schema: 'public', table: 'pharus_app_users' },
    { schema: 'analytics', table: 'pharus_app_users' },
  ];

  for (const { schema, table } of candidates) {
    const q = schema === 'public' ? sb.from(table) : sb.schema(schema).from(table);
    const { data, error } = await q.select('*').limit(5);
    if (error) continue;
    if (!data?.length) continue;

    const byClient = new Map();
    const emailToClient = new Map();
    for (const c of clients) {
      if (c.email) emailToClient.set(String(c.email).toLowerCase(), c.id);
    }

    for (const row of data) {
      let clientId = row.client_id ?? row.cliente_id ?? null;
      let match = clientId ? 'exact_id' : 'not_found';
      if (!clientId && row.email) {
        clientId = emailToClient.get(String(row.email).toLowerCase()) ?? null;
        if (clientId) match = 'email';
      }
      if (!clientId && row.nome) {
        const hit = clients.filter((c) => normalizeNameKey(c.name) === normalizeNameKey(row.nome));
        if (hit.length === 1) {
          clientId = hit[0].id;
          match = 'name_unique';
        } else if (hit.length > 1) match = 'ambiguous';
      }
      if (!clientId) continue;
      byClient.set(clientId, {
        client_id: clientId,
        has_app_access: true,
        app_first_access_at: row.first_access_at ?? row.primeiro_acesso ?? row.created_at ?? null,
        app_last_access_at: row.last_access_at ?? row.ultimo_acesso ?? row.updated_at ?? null,
        app_match_status: match,
        app_access_proxy: row.last_access_at ? null : 'registration',
        source_note: `${schema}.${table}`,
      });
    }
    if (byClient.size) return { rows: [...byClient.values()], note: `${schema}.${table}` };
  }

  return {
    rows: [],
    note: 'Nenhuma tabela App PHARUS encontrada nos schemas expostos (clusterizacao_pharus, public, analytics).',
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
  const appProbe = await probeAppPharus(clients.filter((c) => (c.programa ?? '').toUpperCase() === 'PHARUS'));

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
