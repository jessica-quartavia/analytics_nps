#!/usr/bin/env node
/**
 * Auditoria read-only — clientes ativos analíticos (carteira PHARUS).
 * Saída: data/quality/active_clients_audit.json
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveAnalyticalActiveClient,
  isRawStatusActive,
} from '../lib/analytics/analytical-active-client.mjs';
import {
  loadMilestoneSourcesFromDir,
  resolveMilestoneRawDir,
} from '../lib/analytics/milestone-source-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');

function writeJson(rel, obj) {
  const p = join(DATA, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function loadClients() {
  const paths = [
    join(DATA, 'ingest/partials/clients.json'),
    join(DATA, 'deploy/public/processed/clients.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      return { clients: raw, source: p };
    }
  }
  return { clients: [], source: null };
}

async function main() {
  const { clients: allClients, source: clientsSource } = loadClients();
  const pharus = allClients.filter((c) => (c.programa ?? '').toUpperCase() === 'PHARUS');

  const rawDir = await resolveMilestoneRawDir(DATA, { dataRoot: DATA });
  let cancellations = [];
  let freezeRows = [];
  let milestoneSource = rawDir;

  if (rawDir) {
    const { loaded } = await loadMilestoneSourcesFromDir(rawDir);
    cancellations = loaded['cancellations.json'] ?? [];
    freezeRows = loaded['freeze_change_requests.json'] ?? [];
    if (loaded['clients.json']?.length) {
      // prefer snapshot clients when available
      const snapPharus = loaded['clients.json'].filter(
        (c) => (c.programa ?? '').toUpperCase() === 'PHARUS',
      );
      if (snapPharus.length) {
        pharus.length = 0;
        pharus.push(...snapPharus);
      }
    }
  }

  const context = { cancellations, freezeRows };
  const resolved = pharus.map((client) => ({
    client,
    ...resolveAnalyticalActiveClient(client, context),
  }));

  function normalizeStatus(s) {
    return (s ?? '').trim();
  }

  let rawStatusActive = 0;
  let analyticalActive = 0;
  let excludedFrozen = 0;
  let excludedEffectiveCancellation = 0;
  let rawActiveButCancelled = 0;
  let rawActiveButFrozen = 0;
  let statusMissing = 0;
  let conflicts = 0;

  const rawActiveButCancelledList = [];
  const frozenList = [];

  for (const r of resolved) {
    const rawActive = isRawStatusActive(r.client?.status);
    if (rawActive) rawStatusActive++;
    if (r.is_active_analytical) analyticalActive++;
    if (!normalizeStatus(r.client?.status)) statusMissing++;

    if (r.freeze_source || r.final_analytical_status?.includes('congelado')) {
      excludedFrozen++;
      frozenList.push({
        client_id: r.client.id,
        client_name: r.client.name,
        raw_status: r.raw_status,
        freeze_status: r.freeze_status ?? null,
        freeze_date: r.freeze_date ?? null,
        final_analytical_status: r.final_analytical_status,
      });
    }

    if (r.effective_cancellation_signal) {
      excludedEffectiveCancellation++;
      if (rawActive) {
        rawActiveButCancelled++;
        rawActiveButCancelledList.push({
          client_id: r.client.id,
          client_name: r.client.name,
          raw_status: r.raw_status,
          effective_cancellation_signal: r.effective_cancellation_signal,
          cancellation_date: r.cancellation_date,
          final_analytical_status: r.final_analytical_status,
        });
      }
    }

    if (rawActive && r.final_analytical_status?.includes('congelado')) {
      rawActiveButFrozen++;
      conflicts++;
    }
    if (rawActive && !r.is_active_analytical && r.effective_cancellation_signal) conflicts++;
  }

  const doc = {
    generated_at: new Date().toISOString(),
    rule_version: 'analytical-active-client_v1',
    sources: {
      clients: clientsSource,
      raw_snapshot_dir: milestoneSource,
      effective_cancellation_fields: ['cancellations.churn_efetivado_at', 'cancellations.data_churn'],
      churn_request_fields: ['cancellations.intencao_registrada_at', 'cancellations.data_pedido'],
      freeze_fields: ['freeze_change_requests', 'clients.status', 'clients.data_congelamento'],
      base_qv: 'BASE QV (somente leitura)',
    },
    program_scope: 'PHARUS',
    summary: {
      total_clients_considered: pharus.length,
      raw_status_active: rawStatusActive,
      analytical_active: analyticalActive,
      excluded_frozen: excludedFrozen,
      excluded_effective_cancellation: excludedEffectiveCancellation,
      raw_active_but_cancelled: rawActiveButCancelled,
      raw_active_but_frozen: rawActiveButFrozen,
      status_missing: statusMissing,
      conflicts,
    },
    raw_active_but_cancelled: rawActiveButCancelledList,
    frozen_clients: frozenList,
    note:
      'População de campanha NPS (clientes com envio / respondentes) não é filtrada por esta regra. Use analytical_active apenas para métricas de carteira atual.',
  };

  writeJson('quality/active_clients_audit.json', doc);
  writeJson('deploy/public/quality/active_clients_audit.json', doc);

  console.log(
    `Active clients audit: ${analyticalActive} ativos analíticos / ${pharus.length} PHARUS (raw ativo: ${rawStatusActive})`,
  );
  console.log(`  → data/quality/active_clients_audit.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
