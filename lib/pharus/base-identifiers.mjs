import { readDataJson } from '../deploy/build-input.mjs';
import { normalizeEmail } from '../analytics/pharus-app-match.mjs';
import { createBusinessDataClient } from '../persistence/business-data-client.mjs';
import { fetchAllPaginated } from '../analytics/payment-entry-date.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadPharusClientIds() {
  const clients =
    readDataJson(root, 'ingest/partials/clients.json') ??
    readDataJson(root, 'processed/clients.json') ??
    [];
  return clients
    .filter((c) => (c.programa ?? c.program ?? '').toUpperCase() === 'PHARUS')
    .map((c) => c.id ?? c.client_id)
    .filter(Boolean);
}

function emailsFromResponses() {
  const emailByClient = new Map();
  for (const rel of [
    'processed/responses.json',
    'ingest/partials/nps_responses_1.json',
    'ingest/partials/nps_responses_2.json',
  ]) {
    const rows = readDataJson(root, rel, []);
    for (const r of rows ?? []) {
      const id = r.client_id;
      const em = normalizeEmail(r.client_email ?? r.email);
      if (id && em) emailByClient.set(id, em);
    }
  }
  return emailByClient;
}

/**
 * Identificadores para matching — prioriza base0.clientes (cpf_norm, email_norm, telefone_norm).
 */
export async function loadPharusClientIdentifiers() {
  const pharusIds = new Set(loadPharusClientIds());
  const emailByClient = emailsFromResponses();
  const byId = new Map();

  for (const id of pharusIds) {
    byId.set(id, {
      client_id: id,
      cpf: null,
      email: emailByClient.get(id) ?? null,
      phone: null,
      identifier_sources: [],
    });
  }

  let base0Rows = 0;
  try {
    const sb = createBusinessDataClient('base0');
    const rows = await fetchAllPaginated(
      sb,
      'clientes',
      'base_qv_id,programa,cpf_norm,email_norm,telefone_norm,email,telefone,cpf_raw',
    );
    for (const row of rows) {
      if ((row.programa ?? '').toUpperCase() !== 'PHARUS') continue;
      const id = row.base_qv_id;
      if (!id || !pharusIds.has(id)) continue;
      base0Rows += 1;
      const cur = byId.get(id);
      cur.cpf = row.cpf_norm ?? row.cpf_raw ?? cur.cpf;
      cur.email = normalizeEmail(row.email_norm ?? row.email) || cur.email;
      cur.phone = row.telefone_norm ?? row.telefone ?? cur.phone;
      cur.identifier_sources.push('base0.clientes');
    }
  } catch (e) {
    console.warn('[pharus-identifiers] base0.clientes indisponível:', e.message ?? e);
  }

  const entries = [...byId.values()].map((c) => ({
    client_id: c.client_id,
    cpf: c.cpf,
    email: c.email,
    phone: c.phone,
  }));

  const withCpf = entries.filter((e) => e.cpf).length;
  const withEmail = entries.filter((e) => e.email).length;
  const withPhone = entries.filter((e) => e.phone).length;
  const withAny = entries.filter((e) => e.cpf || e.email || e.phone).length;

  return {
    entries,
    audit: {
      pharus_clients_in_universe: pharusIds.size,
      base0_rows_merged: base0Rows,
      with_cpf: withCpf,
      with_email: withEmail,
      with_phone: withPhone,
      with_any_identifier: withAny,
      insufficient_identifiers: entries.length - withAny,
    },
  };
}
