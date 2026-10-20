#!/usr/bin/env node
/**
 * Materializa nps_measurements_consolidated.json:
 * histórico oficial (nps_historico) + ciclo atual BASE QV.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import { writeJson, readJson } from '../lib/data/file-store.mjs';
import {
  fetchNpsHistoricoMedicoes,
  fetchNpsHistoricoRespostas,
} from '../lib/data/nps-historico-db.mjs';
import { loadAnalyticalCycleConfig } from '../lib/analytics/analytical-cycles.mjs';
import { canonicalizeNpsCycle } from '../lib/analytics/nps-cycle-canonical.mjs';
import { buildNpsMeasurementsConsolidated } from '../lib/analytics/nps-measurements-consolidated.mjs';
import { readDataJson } from '../lib/deploy/build-input.mjs';
import {
  buildCanonicalCurrentCycleNpsPoint,
  canonicalCurrentCycleKpiFromPoint,
  tagAuditFullT3MeasurementRow,
} from '../dashboard/js/data/canonical-current-cycle-nps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function resolveCurrentCycleLabel(analyticalConfig) {
  const src = [...(analyticalConfig ?? [])]
    .filter((c) => c.type === 'source_cycle')
    .sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))[0];
  return canonicalizeNpsCycle(src?.cycle_code ?? 'NPS-2026-SET-PHARUS');
}

export async function generateNpsMeasurementsConsolidated() {
  const generatedAt = new Date().toISOString();
  const buildCommit = gitHead();
  const datasetVersion = buildCommit
    ? `nps-measurements-consolidated-${buildCommit.slice(0, 12)}`
    : `nps-measurements-consolidated-${generatedAt}`;

  const [historicoRespostas, historicoMedicoes] = await Promise.all([
    fetchNpsHistoricoRespostas(),
    fetchNpsHistoricoMedicoes(),
  ]);

  let baseQvDoc = null;
  try {
    baseQvDoc = await readJson('processed/nps_measurements_baseqv.json');
  } catch {
    console.warn('[consolidated] nps_measurements_baseqv.json ausente — rode generate:nps-measurements-baseqv');
  }

  const analyticalConfig = loadAnalyticalCycleConfig();
  const currentCycleLabel = resolveCurrentCycleLabel(analyticalConfig);
  const fullT3BaseQvRow =
    baseQvDoc?.measurements?.find((m) => m.label === currentCycleLabel) ?? null;
  const responsesSnapshot = readDataJson(root, 'processed/responses.json', []);
  const cyclesSnapshot = readDataJson(root, 'processed/cycles.json', []);
  const cycleSummaryDoc = readDataJson(root, 'processed/cycle_summary.json', {});
  const sourceCycleDef =
    cyclesSnapshot.find((c) => c.type === 'source_cycle') ??
    cyclesSnapshot.find((c) => canonicalizeNpsCycle(c.cycle_code) === currentCycleLabel) ??
    null;
  const cycleSummaryTemplate =
    cycleSummaryDoc?.cycles?.find((c) => c.cycle_code === sourceCycleDef?.cycle_code) ?? null;

  const canonicalPoint = buildCanonicalCurrentCycleNpsPoint({
    responses: responsesSnapshot,
    cycles: cyclesSnapshot,
    cycleDef: sourceCycleDef,
    cycleSummaryTemplate,
    measurementLabel: currentCycleLabel,
  });

  const currentBaseQvMeasurement = canonicalPoint
    ? {
        cycle_code: canonicalPoint.analytical_cycle,
        label: canonicalPoint.measurement,
        cycle_type: 'source_cycle',
        aggregation: 'official_source_cycle',
        valid_responses: canonicalPoint.responses,
        unique_clients: canonicalPoint.distinct_clients,
        deduped_responses: canonicalPoint.responses,
        promoters: canonicalPoint.promoters,
        neutrals: canonicalPoint.neutrals,
        detractors: canonicalPoint.detractors,
        nps: canonicalPoint.nps,
        average_score: canonicalPoint.average_score,
        operational_role: 'canonical_current',
        analytical_cycle: canonicalPoint.analytical_cycle,
        source_window: canonicalPoint.source_window,
        universe: canonicalPoint.universe,
      }
    : fullT3BaseQvRow;

  const baseQvResponseIndex = (baseQvDoc?.response_index ?? []).filter(
    (r) => (r.measurement ?? r.cycle) === currentCycleLabel,
  );

  const built = buildNpsMeasurementsConsolidated({
    historicoRespostas,
    historicoMedicoes,
    currentBaseQvMeasurement,
    baseQvResponseIndex,
    currentCycleLabel,
  });

  const measurements = [...built.measurements];
  const currentIdx = measurements.findIndex(
    (m) => (m.cycle ?? m.label) === currentCycleLabel,
  );
  if (currentIdx >= 0 && canonicalPoint) {
    measurements[currentIdx] = {
      ...measurements[currentIdx],
      ...currentBaseQvMeasurement,
      cycle: currentCycleLabel,
      label: currentCycleLabel,
      source: 'BASE_QV',
      source_label: 'Ciclo analítico PHARUS',
      responses: canonicalPoint.responses,
      operational_role: 'canonical_current',
    };
  }

  const doc = {
    meta: {
      generated_at: generatedAt,
      dataset_version: datasetVersion,
      build_commit: buildCommit,
      source_rule: built.source_rule,
      measurements_since: built.measurements_since,
      current_cycle_label: built.current_cycle_label,
      historico_respostas_rows: historicoRespostas.length,
      historico_medicoes_rows: historicoMedicoes.length,
      base_qv_dataset_version: baseQvDoc?.meta?.dataset_version ?? null,
      canonical_current_cycle: canonicalCurrentCycleKpiFromPoint(canonicalPoint),
      audit: {
        full_t3_base_qv_window: fullT3BaseQvRow
          ? tagAuditFullT3MeasurementRow({
              cycle: currentCycleLabel,
              label: currentCycleLabel,
              ...fullT3BaseQvRow,
              responses: fullT3BaseQvRow.valid_responses ?? fullT3BaseQvRow.deduped_responses,
            })
          : null,
      },
    },
    measurements,
    response_index: built.response_index,
  };

  await writeJson('processed/nps_measurements_consolidated.json', doc);
  await writeJson('quality/nps_measurements_consolidated_audit.json', {
    generated_at: generatedAt,
    dataset_version: datasetVersion,
    build_commit: buildCommit,
    current_cycle_label: currentCycleLabel,
    measurement_table: built.audit_rows,
    historico_medicoes: historicoMedicoes,
    base_qv_q2_reconstruction: baseQvDoc?.measurements?.find((m) => m.label === '2026-Q2') ?? null,
    precedence: {
      closed_cycles: 'nps_historico.respostas validated by nps_historico.medicoes',
      current_cycle: 'BASE_QV official window (not summed with historico for same label)',
    },
  });

  return doc;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateNpsMeasurementsConsolidated()
    .then((doc) => {
      console.log(
        JSON.stringify(
          {
            points: doc.measurements.map((m) => ({
              cycle: m.cycle,
              source: m.source,
              responses: m.responses,
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
