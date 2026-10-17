#!/usr/bin/env node
/**
 * Materializa nps_measurements_baseqv.json diretamente da BASE QV (SELECT).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import { writeJson } from '../lib/data/file-store.mjs';
import { createBaseQvClient, fetchNpsCycles, fetchNpsResponses, fetchTableAll } from '../lib/data/base-qv.mjs';
import { loadAnalyticalCycleConfig } from '../lib/analytics/analytical-cycles.mjs';
import { buildNpsMeasurementsBaseQv } from '../lib/analytics/nps-measurements-baseqv.mjs';
import { readDataJson } from '../lib/deploy/build-input.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export async function generateNpsMeasurementsBaseQv() {
  const generatedAt = new Date().toISOString();
  const buildCommit = gitHead();
  const datasetVersion = buildCommit
    ? `nps-measurements-baseqv-${buildCommit.slice(0, 12)}`
    : `nps-measurements-baseqv-${generatedAt}`;

  const baseQv = createBaseQvClient();
  const [sourceCycles, responses, clients] = await Promise.all([
    fetchNpsCycles(baseQv),
    fetchNpsResponses(baseQv),
    fetchTableAll(baseQv, 'clients', 'id, programa'),
  ]);
  const clientsMap = new Map(clients.map((c) => [c.id, c]));

  const analyticalConfig = loadAnalyticalCycleConfig();
  const built = buildNpsMeasurementsBaseQv({
    responses,
    sourceCycles,
    clientsMap,
    analyticalConfig,
  });

  const legacyHistorico2 = readDataJson(root, 'processed/historico2_clients_enriched.json');
  const legacySeries = legacyHistorico2?.measurements?.series ?? [];
  const comparison = built.measurements.map((m) => {
    const legacy = legacySeries.find((s) => s.measurement === m.label);
    return {
      measurement: m.label,
      base_qv_valid: m.valid_responses,
      materialized_chart_legacy: legacy?.valid_responses ?? null,
      graph_should_match: m.valid_responses,
    };
  });

  const sourceMaxSubmitted = responses.reduce((max, r) => {
    const t = r.submitted_at ? Date.parse(r.submitted_at) : 0;
    return t > max ? t : max;
  }, 0);

  const doc = {
    meta: {
      source: built.source,
      generated_at: generatedAt,
      dataset_version: datasetVersion,
      build_commit: buildCommit,
      source_max_updated_at: sourceMaxSubmitted ? new Date(sourceMaxSubmitted).toISOString() : null,
      dedupe_rule: built.dedupe_rule,
      base_qv_responses_rows: responses.length,
      base_qv_cycles_rows: sourceCycles.length,
    },
    analytical_cycles_config: analyticalConfig,
    measurements: built.measurements,
    response_index: built.response_index,
  };

  await writeJson('processed/nps_measurements_baseqv.json', doc);
  await writeJson('quality/nps_measurements_baseqv_audit.json', {
    generated_at: generatedAt,
    dataset_version: datasetVersion,
    build_commit: buildCommit,
    source: built.source,
    base_qv_cycles: sourceCycles.map((c) => ({
      cycle_id: c.id,
      cycle_code: c.name,
      label: c.name,
      start_at: c.starts_at,
      end_at: c.ends_at,
      status: c.status ?? null,
    })),
    measurement_table: built.measurements,
    legacy_vs_baseqv: comparison,
    parity_notes: {
      current_cycle_uses: 'aggregateNpsForOfficialSourceCycleWindow',
      reconstruction_uses: 'matchesAnalyticalCycle + dedupeByClientAndAnalyticalCycle',
    },
  });

  return doc;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateNpsMeasurementsBaseQv()
    .then((doc) => {
      console.log(
        JSON.stringify(
          {
            measurements: doc.measurements.map((m) => ({
              label: m.label,
              valid: m.valid_responses,
              nps: m.nps,
            })),
          },
          null,
          2,
        ),
      );
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
