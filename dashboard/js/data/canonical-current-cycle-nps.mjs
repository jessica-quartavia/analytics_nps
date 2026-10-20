/**
 * NPS do ciclo analítico corrente (ex.: SET → label 2026-Q3, 283 / 61,5).
 * Kernel idêntico ao Executivo — não usar linha materializada 408/63,7 (janela T3 completa) na UI operacional.
 */
import { buildExecutiveCurrentNpsSummary } from './executive-official-nps.mjs';
import { canonicalizeNpsCycle } from '../utils/nps-cycle-labels.mjs';

export const FULL_T3_WINDOW_UI_LABEL = 'Janela T3 completa BASE QV';

export function resolveSourceCycleDefForMeasurement(cycles, measurementLabel) {
  if (!measurementLabel) return null;
  const list = cycles ?? [];
  for (const c of list) {
    if (c.type === 'source_cycle' && canonicalizeNpsCycle(c.cycle_code) === measurementLabel) {
      return c;
    }
  }
  return list.find((c) => c.type === 'source_cycle') ?? null;
}

/**
 * @returns {object|null} ponto de série por medição + metadata operacional
 */
export function buildCanonicalCurrentCycleNpsPoint({
  responses,
  cycles,
  cycleDef,
  cycleSummaryTemplate,
  measurementLabel,
}) {
  const label = measurementLabel ?? null;
  const def =
    cycleDef ??
    (label ? resolveSourceCycleDefForMeasurement(cycles, label) : null) ??
    (cycles ?? []).find((c) => c.type === 'source_cycle') ??
    null;
  if (!def?.cycle_code) return null;

  const summary = buildExecutiveCurrentNpsSummary(
    responses ?? [],
    cycleSummaryTemplate ?? {},
    def,
  );
  const measurement = label ?? canonicalizeNpsCycle(def.cycle_code);
  const useWindow =
    def.type === 'source_cycle' && (def.starts_at != null || def.ends_at != null);

  return {
    measurement,
    responses: summary.valid_responses,
    distinct_clients: summary.valid_responses,
    promoters: summary.promoters,
    neutrals: summary.passives,
    detractors: summary.detractors,
    nps: summary.nps,
    average_score: summary.average_score ?? null,
    source: 'BASE_QV',
    source_label: 'Ciclo analítico PHARUS',
    analytical_cycle: def.cycle_code,
    source_window: useWindow ? 'official_source_cycle' : 'analytical_cycle',
    universe: summary._nps_universe ?? null,
    is_canonical_current: true,
  };
}

/** KPI compacto (paridade Executivo / Histórico / Safras). */
export function canonicalCurrentCycleKpiFromPoint(point) {
  if (!point) return null;
  return {
    measurement: point.measurement,
    responses: point.responses,
    promoters: point.promoters,
    neutrals: point.neutrals,
    detractors: point.detractors,
    nps: point.nps,
    average_score: point.average_score ?? null,
    analytical_cycle: point.analytical_cycle ?? null,
    source_window: point.source_window ?? null,
    universe: point.universe ?? null,
  };
}

/** Linha materializada 408/63,7 — somente auditoria / quality, não KPI “NPS atual”. */
export function isAuditFullT3MeasurementRow(row) {
  if (!row) return false;
  if (row.operational_role === 'audit_full_t3') return true;
  const n = Number(row.valid_responses ?? row.responses ?? 0);
  return (
    row.aggregation === 'official_source_window' &&
    n >= 400 &&
    row.historico_medicoes_skipped != null
  );
}

export function tagAuditFullT3MeasurementRow(row) {
  if (!row) return row;
  return {
    ...row,
    operational_role: 'audit_full_t3',
    ui_label: FULL_T3_WINDOW_UI_LABEL,
    universe: 'full_measurement_label_base_qv',
    is_canonical_current: false,
  };
}
