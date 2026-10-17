import { calculateNpsSummary, isValidScore } from './nps.mjs';
import { cycleSortKey } from './nps-cycle-canonical.mjs';

export const NPS_HISTORICO_SOURCE = 'Business Data · nps_historico';
export const MEASUREMENTS_SINCE = '2025-Q2';

const SINCE_KEY = cycleSortKey(MEASUREMENTS_SINCE);

function parseOfficialNps(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function categoryToBucket(categoria, score) {
  const c = String(categoria ?? '').toLowerCase();
  if (c.includes('promot')) return 'promoter';
  if (c.includes('detrat')) return 'detractor';
  if (c.includes('neutr')) return 'neutral';
  if (score == null) return null;
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'neutral';
  return 'detractor';
}

/**
 * Agrega linhas de nps_historico.respostas por ciclo (medição oficial).
 */
export function aggregateNpsHistoricoRespostasByCiclo(rows) {
  const byCiclo = new Map();
  for (const row of rows ?? []) {
    const ciclo = row.ciclo;
    if (!ciclo) continue;
    if (cycleSortKey(ciclo) < SINCE_KEY) continue;
    if (!byCiclo.has(ciclo)) byCiclo.set(ciclo, []);
    byCiclo.get(ciclo).push(row);
  }

  const out = [];
  for (const [ciclo, bucket] of byCiclo.entries()) {
    const valid = bucket.filter((r) => isValidScore(Number(r.nota_nps)));
    const scores = valid.map((r) => Number(r.nota_nps));
    let promoters = 0;
    let neutrals = 0;
    let detractors = 0;
    for (const r of valid) {
      const score = Number(r.nota_nps);
      const bucketName = categoryToBucket(r.categoria, score);
      if (bucketName === 'promoter') promoters += 1;
      else if (bucketName === 'neutral') neutrals += 1;
      else if (bucketName === 'detractor') detractors += 1;
    }
    const summary = scores.length ? calculateNpsSummary(scores.map((score) => ({ score }))) : null;
    out.push({
      cycle: ciclo,
      raw_responses: bucket.length,
      valid_responses: valid.length,
      unique_clients: new Set(valid.map((r) => r.id_cliente).filter(Boolean)).size,
      promoters: summary?.promoters ?? promoters,
      neutrals: summary?.passives ?? neutrals,
      detractors: summary?.detractors ?? detractors,
      nps: summary?.nps ?? null,
      average_score: summary?.average_score ?? null,
    });
  }
  out.sort((a, b) => cycleSortKey(a.cycle) - cycleSortKey(b.cycle));
  return out;
}

export function buildHistoricoResponseIndex(rows) {
  const index = [];
  for (const row of rows ?? []) {
    const ciclo = row.ciclo;
    if (!ciclo || cycleSortKey(ciclo) < SINCE_KEY) continue;
    const score = Number(row.nota_nps);
    if (!isValidScore(score)) continue;
    index.push({
      cycle: ciclo,
      client_key: row.id_cliente ?? null,
      programa: row.programa ?? null,
      ep: row.ep ?? null,
      score,
      source: 'nps_historico',
      source_table: 'nps_historico.respostas',
    });
  }
  return index;
}

/**
 * Valida agregado de respostas vs nps_historico.medicoes.
 */
export function compareHistoricoAggToMedicoes(aggregated, medicoesRow) {
  if (!medicoesRow) return { ok: false, reason: 'medicoes_missing' };
  const officialNps = parseOfficialNps(medicoesRow.nps);
  const npsDelta =
    officialNps != null && aggregated.nps != null
      ? Math.round((aggregated.nps - officialNps) * 1000) / 1000
      : null;
  return {
    ok:
      aggregated.valid_responses === Number(medicoesRow.respostas) &&
      aggregated.promoters === Number(medicoesRow.promotores) &&
      aggregated.neutrals === Number(medicoesRow.neutros) &&
      aggregated.detractors === Number(medicoesRow.detratores) &&
      (npsDelta == null || Math.abs(npsDelta) < 0.15),
    responses_delta: aggregated.valid_responses - Number(medicoesRow.respostas ?? 0),
    nps_delta: npsDelta,
    medicoes_nps: officialNps,
    calculated_nps: aggregated.nps,
  };
}

export function historicoMeasurementFromOfficial({
  aggregated,
  medicoesRow,
  sourceTable = 'nps_historico.respostas',
}) {
  const officialNps = parseOfficialNps(medicoesRow?.nps);
  return {
    cycle: aggregated.cycle,
    label: aggregated.cycle,
    source: 'nps_historico',
    source_label: 'Histórico oficial',
    source_table: sourceTable,
    medicao: medicoesRow?.medicao ?? null,
    janela_datas: medicoesRow?.janela_datas ?? null,
    raw_responses: aggregated.raw_responses,
    valid_responses: aggregated.valid_responses,
    unique_clients: aggregated.unique_clients,
    responses: aggregated.valid_responses,
    promoters: aggregated.promoters,
    neutrals: aggregated.neutrals,
    detractors: aggregated.detractors,
    nps: officialNps ?? aggregated.nps,
    average_score:
      medicoesRow?.nota_media != null
        ? Number(medicoesRow.nota_media)
        : aggregated.average_score,
  };
}
