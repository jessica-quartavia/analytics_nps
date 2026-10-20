#!/usr/bin/env node
/**
 * Atualiza nps_measurements_consolidated.json: ciclo corrente operacional (283/61,5)
 * e move 408/63,7 para meta.audit.full_t3_base_qv_window.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCanonicalCurrentCycleNpsPoint,
  canonicalCurrentCycleKpiFromPoint,
  tagAuditFullT3MeasurementRow,
  isAuditFullT3MeasurementRow,
} from '../dashboard/js/data/canonical-current-cycle-nps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = [
  join(root, 'data/processed/nps_measurements_consolidated.json'),
  join(root, 'data/deploy/public/processed/nps_measurements_consolidated.json'),
];

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function patchDoc(doc, responses, cycles, cycleSummaryDoc) {
  const current = doc.meta?.current_cycle_label;
  if (!current) return doc;
  const sourceCycleDef =
    cycles.find((c) => c.type === 'source_cycle') ??
    cycles.find((c) => String(c.cycle_code).includes('SET')) ??
    null;
  const template =
    cycleSummaryDoc?.cycles?.find((c) => c.cycle_code === sourceCycleDef?.cycle_code) ?? null;
  const canonicalPoint = buildCanonicalCurrentCycleNpsPoint({
    responses,
    cycles,
    cycleDef: sourceCycleDef,
    cycleSummaryTemplate: template,
    measurementLabel: current,
  });
  if (!canonicalPoint) return doc;

  const idx = doc.measurements.findIndex((m) => (m.cycle ?? m.label) === current);
  const prevRow = idx >= 0 ? doc.measurements[idx] : null;
  const auditRow =
    prevRow && isAuditFullT3MeasurementRow(prevRow)
      ? tagAuditFullT3MeasurementRow(prevRow)
      : doc.meta?.audit?.full_t3_base_qv_window ?? null;

  if (idx >= 0) {
    doc.measurements[idx] = {
      ...prevRow,
      cycle: current,
      label: current,
      source: 'BASE_QV',
      source_label: 'Ciclo analítico PHARUS',
      valid_responses: canonicalPoint.responses,
      unique_clients: canonicalPoint.distinct_clients,
      responses: canonicalPoint.responses,
      promoters: canonicalPoint.promoters,
      neutrals: canonicalPoint.neutrals,
      detractors: canonicalPoint.detractors,
      nps: canonicalPoint.nps,
      average_score: canonicalPoint.average_score,
      operational_role: 'canonical_current',
      analytical_cycle: canonicalPoint.analytical_cycle,
      source_window: canonicalPoint.source_window,
      universe: canonicalPoint.universe,
    };
  }

  doc.meta = {
    ...doc.meta,
    canonical_current_cycle: canonicalCurrentCycleKpiFromPoint(canonicalPoint),
    audit: {
      ...(doc.meta?.audit ?? {}),
      full_t3_base_qv_window: auditRow,
    },
  };
  return doc;
}

const responses = loadJson(join(root, 'data/processed/responses.json'));
const cycles = loadJson(join(root, 'data/processed/cycles.json'));
const cycleSummaryDoc = loadJson(join(root, 'data/processed/cycle_summary.json'));

for (const p of paths) {
  try {
    const doc = patchDoc(loadJson(p), responses, cycles, cycleSummaryDoc);
    writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    console.log('patched', p);
  } catch (e) {
    console.warn('skip', p, e.message);
  }
}
