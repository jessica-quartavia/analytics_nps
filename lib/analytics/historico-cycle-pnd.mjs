import { canonicalizeNpsCycle, cycleSortKey } from './nps-cycle-canonical.mjs';
import {
  dedupeLatestNpsByClient,
  npsScoreFromRow,
  calculateNpsSummary,
} from './nps.mjs';

function roundPct(num, total) {
  if (!total) return null;
  return Math.round((1000 * num) / total) / 10;
}

/**
 * Agrega P/N/D por ciclo canônico: recorte de ciclo → dedupe por cliente → classificação 9–10 / 7–8 / 0–6.
 * @param {Array<object>} rows
 * @param {{ cycleField?: string }} [opts]
 * @returns {Map<string, object>}
 */
export function aggregateHistoricoPndByCanonicalCycle(rows, opts = {}) {
  const { cycleField = 'nps_cycle' } = opts;
  /** @type {Map<string, Array<object>>} */
  const buckets = new Map();

  for (const row of rows ?? []) {
    const rawCycle = row[cycleField] ?? row.ciclo;
    const canon = canonicalizeNpsCycle(rawCycle);
    if (!canon) continue;
    if (npsScoreFromRow(row) == null && row.nota_nps == null) continue;
    if (!buckets.has(canon)) buckets.set(canon, []);
    buckets.get(canon).push({
      ...row,
      score: npsScoreFromRow(row) ?? row.nota_nps,
      submitted_at: row.submitted_at ?? row.response_date ?? row.data_resposta,
      response_id: row.response_id ?? row.response_key,
      client_id: row.client_id ?? row.base_qv_id,
    });
  }

  /** @type {Map<string, object>} */
  const out = new Map();
  for (const [canon, bucketRows] of buckets) {
    const deduped = dedupeLatestNpsByClient(bucketRows, { requireClientId: true });
    const summary = calculateNpsSummary(deduped.map((r) => ({ score: r.score })));
    const valid = summary.total ?? 0;
    out.set(canon, {
      ciclo: canon,
      valid,
      promotores: summary.promoters,
      neutros: summary.passives,
      detratores: summary.detractors,
      pct_promotores: roundPct(summary.promoters, valid),
      pct_neutros: roundPct(summary.passives, valid),
      pct_detratores: roundPct(summary.detractors, valid),
      nps_derivado: summary.nps,
      clientes_unicos: valid,
    });
  }
  return out;
}

/**
 * Lista detratores deduplicados de um ciclo canônico (auditoria).
 * @param {Array<object>} rows
 * @param {string} canonicalCycle
 * @param {{ cycleField?: string }} [opts]
 */
export function listHistoricoDetractorsForCycle(rows, canonicalCycle, opts = {}) {
  const map = aggregateHistoricoPndByCanonicalCycle(rows, opts);
  const { cycleField = 'nps_cycle' } = opts;
  const canon = canonicalizeNpsCycle(canonicalCycle);
  const bucketRows = (rows ?? []).filter(
    (r) => canonicalizeNpsCycle(r[cycleField] ?? r.ciclo) === canon,
  );
  const deduped = dedupeLatestNpsByClient(
    bucketRows.map((row) => ({
      ...row,
      score: npsScoreFromRow(row) ?? row.nota_nps,
      submitted_at: row.submitted_at ?? row.response_date ?? row.data_resposta,
      response_id: row.response_id ?? row.response_key,
      client_id: row.client_id ?? row.base_qv_id,
    })),
    { requireClientId: true },
  );
  return deduped
    .filter((r) => r.score <= 6)
    .map((r) => ({
      client_id: r.client_id,
      client_name: r.client_name,
      response_id: r.response_id ?? r.response_key,
      submitted_at: r.submitted_at ?? r.response_date ?? r.data_resposta,
      score: r.score,
      categoria: 'Detrator',
      cycle_original: r[cycleField] ?? r.ciclo,
      cycle_canonical: canon,
    }))
    .sort((a, b) => String(a.client_name ?? '').localeCompare(String(b.client_name ?? ''), 'pt-BR'));
}

/**
 * Sobrepõe contagens P/N/D derivadas de respostas individuais nas linhas de ciclo do histórico.
 * @param {Array<object>} cycles
 * @param {Map<string, object>} pndByCycle
 */
export function overlayHistoricoCyclePnd(cycles, pndByCycle) {
  return (cycles ?? []).map((c) => {
    const pnd = pndByCycle.get(canonicalizeNpsCycle(c.ciclo));
    if (!pnd || !pnd.valid) return c;
    return {
      ...c,
      promotores: pnd.promotores,
      neutros: pnd.neutros,
      detratores: pnd.detratores,
      pct_promotores: pnd.pct_promotores,
      pct_neutros: pnd.pct_neutros,
      pct_detratores: pnd.pct_detratores,
      respostas_derivadas: pnd.valid,
      clientes_unicos: pnd.clientes_unicos,
      pnd_source: 'responses_dedupe',
    };
  });
}

export function sortedCanonicalCycleKeys(pndByCycle) {
  return [...pndByCycle.keys()].sort((a, b) => cycleSortKey(a) - cycleSortKey(b));
}
