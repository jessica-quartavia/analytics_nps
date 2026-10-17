import { canonicalizeNpsCycle, cycleSortKey } from './nps-cycle-canonical.mjs';
import { aggregateNpsFromResponses } from './nps.mjs';
import {
  aggregateNpsHistoricoRespostasByCiclo,
  buildHistoricoResponseIndex,
  compareHistoricoAggToMedicoes,
  historicoMeasurementFromOfficial,
  MEASUREMENTS_SINCE,
} from './nps-historico-official.mjs';

export const CONSOLIDATED_SOURCE_RULE =
  'Ciclos fechados: nps_historico (respostas + validação medicoes). Ciclo atual: BASE QV (kernel Executivo). Sem somar a mesma medição nas duas fontes.';

/**
 * @param {object} opts
 * @param {object[]} opts.historicoRespostas
 * @param {object[]} opts.historicoMedicoes
 * @param {object|null} opts.currentBaseQvMeasurement — linha de nps_measurements_baseqv (label 2026-Q3)
 * @param {object[]} [opts.baseQvResponseIndex] — índice só do ciclo atual
 * @param {string} opts.currentCycleLabel — ex. 2026-Q3
 */
export function buildNpsMeasurementsConsolidated({
  historicoRespostas = [],
  historicoMedicoes = [],
  currentBaseQvMeasurement = null,
  baseQvResponseIndex = [],
  currentCycleLabel,
}) {
  const medicoesByCiclo = new Map((historicoMedicoes ?? []).map((m) => [m.ciclo, m]));
  const historicoAgg = aggregateNpsHistoricoRespostasByCiclo(historicoRespostas);
  const currentLabel = currentCycleLabel ?? canonicalizeNpsCycle('NPS-2026-SET-PHARUS');

  const measurements = [];
  const auditRows = [];

  for (const agg of historicoAgg) {
    if (agg.cycle === currentLabel) continue;
    const med = medicoesByCiclo.get(agg.cycle);
    const comparison = compareHistoricoAggToMedicoes(agg, med);
    const row = historicoMeasurementFromOfficial({ aggregated: agg, medicoesRow: med });
    measurements.push(row);
    auditRows.push({
      cycle: agg.cycle,
      source: 'nps_historico',
      source_table: 'nps_historico.respostas',
      raw: agg.raw_responses,
      valid: agg.valid_responses,
      unique_clients: agg.unique_clients,
      P: row.promoters,
      N: row.neutrals,
      D: row.detractors,
      nps: row.nps,
      medicoes_validation: comparison,
    });
  }

  if (currentBaseQvMeasurement) {
    const m = currentBaseQvMeasurement;
    const label = m.label ?? currentLabel;
    const histConflict = medicoesByCiclo.get(label);
    measurements.push({
      cycle: label,
      label,
      source: 'BASE_QV',
      source_label: 'BASE QV',
      source_table: 'BASE_QV.nps_responses',
      cycle_code: m.cycle_code ?? null,
      aggregation: m.aggregation ?? 'official_source_window',
      raw_responses: m.raw_responses ?? null,
      valid_responses: m.valid_responses ?? m.deduped_responses,
      unique_clients: m.unique_clients ?? m.valid_responses,
      responses: m.deduped_responses ?? m.valid_responses,
      promoters: m.promoters,
      neutrals: m.neutrals,
      detractors: m.detractors,
      nps: m.nps,
      average_score: m.average_score ?? null,
      historico_medicoes_skipped: histConflict
        ? {
            respostas: histConflict.respostas,
            nps: histConflict.nps,
            reason: 'precedence_current_cycle_base_qv',
          }
        : null,
    });
    auditRows.push({
      cycle: label,
      source: 'BASE_QV',
      source_table: 'BASE_QV.nps_responses',
      raw: m.raw_responses,
      valid: m.valid_responses ?? m.deduped_responses,
      unique_clients: m.unique_clients,
      P: m.promoters,
      N: m.neutrals,
      D: m.detractors,
      nps: m.nps,
      base_qv_vs_historico_medicoes: histConflict
        ? {
            historico_respostas: Number(histConflict.respostas),
            base_qv_valid: m.valid_responses ?? m.deduped_responses,
            delta: (m.valid_responses ?? m.deduped_responses) - Number(histConflict.respostas),
          }
        : null,
    });
  }

  measurements.sort((a, b) => cycleSortKey(a.cycle) - cycleSortKey(b.cycle));

  const historicoIndex = buildHistoricoResponseIndex(historicoRespostas).filter(
    (r) => r.cycle !== currentLabel,
  );
  const currentIndex = (baseQvResponseIndex ?? []).map((r) => ({
    cycle: r.measurement ?? currentLabel,
    client_id: r.client_id,
    client_key: r.client_id,
    score: r.score,
    source: 'BASE_QV',
    source_table: 'BASE_QV.nps_responses',
    programa: null,
    ep: null,
  }));

  return {
    source_rule: CONSOLIDATED_SOURCE_RULE,
    measurements_since: MEASUREMENTS_SINCE,
    current_cycle_label: currentLabel,
    measurements,
    response_index: [...historicoIndex, ...currentIndex],
    audit_rows: auditRows,
  };
}

function normalizeFilterText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function historicoRowMatchesFilters(row, { program, ep, clientNameKeys }) {
  if (program && normalizeFilterText(row.programa) !== normalizeFilterText(program)) return false;
  if (ep && normalizeFilterText(row.ep) !== normalizeFilterText(ep)) return false;
  if (clientNameKeys?.size) {
    const key = normalizeFilterText(row.client_key);
    if (!key || !clientNameKeys.has(key)) return false;
  }
  return true;
}

/** Recalcula série a partir do índice consolidado (filtros explícitos). */
export function aggregateMeasurementsFromConsolidatedIndex(responseIndex, {
  program = null,
  ep = null,
  clientNameKeys = null,
  clientIds = null,
} = {}) {
  let rows = responseIndex ?? [];
  if (clientIds?.size) {
    rows = rows.filter((r) => r.client_id && clientIds.has(r.client_id));
  }
  if (program || ep || clientNameKeys?.size) {
    rows = rows.filter((r) =>
      historicoRowMatchesFilters(r, { program, ep, clientNameKeys }),
    );
  }

  const byCycle = new Map();
  for (const r of rows) {
    if (!byCycle.has(r.cycle)) byCycle.set(r.cycle, []);
    byCycle.get(r.cycle).push(r);
  }

  const series = [];
  for (const [cycle, bucket] of [...byCycle.entries()].sort(
    ([a], [b]) => cycleSortKey(a) - cycleSortKey(b),
  )) {
    const agg = aggregateNpsFromResponses(
      bucket.map((r) => ({ score: r.score })),
      { dedupe: false },
    );
    series.push({
      cycle,
      measurement: cycle,
      valid_responses: agg.responses,
      distinct_clients: new Set(bucket.map((r) => r.client_key ?? r.client_id).filter(Boolean)).size,
      promoters: agg.promoters,
      neutrals: agg.neutrals,
      detractors: agg.detractors,
      nps: agg.nps,
      source: bucket[0]?.source ?? null,
      source_label: bucket[0]?.source === 'BASE_QV' ? 'BASE QV' : 'Histórico oficial',
    });
  }
  return series;
}

export function mapConsolidatedMeasurementsToChart(measurements) {
  return (measurements ?? []).map((m) => ({
    measurement: m.cycle ?? m.label,
    responses: m.responses ?? m.valid_responses ?? 0,
    distinct_clients: m.unique_clients ?? 0,
    promoters: m.promoters ?? 0,
    neutrals: m.neutrals ?? 0,
    detractors: m.detractors ?? 0,
    nps: m.nps ?? null,
    source: m.source ?? null,
    source_label: m.source_label ?? (m.source === 'BASE_QV' ? 'BASE QV' : 'Histórico oficial'),
  }));
}
