/**
 * Auditoria 2026-Q2 — P/N/D com dedupe por ciclo canônico (somente leitura de JSON local).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  aggregateHistoricoPndByCanonicalCycle,
  listHistoricoDetractorsForCycle,
} from '../lib/analytics/historico-cycle-pnd.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const enrichedPath = join(root, 'data/deploy/public/processed/historical_nps_enriched.json');
const enriched = JSON.parse(readFileSync(enrichedPath, 'utf8'));
const rows = enriched.responses ?? [];

const pndMap = aggregateHistoricoPndByCanonicalCycle(rows);
const q2 = pndMap.get('2026-Q2');
const detractors = listHistoricoDetractorsForCycle(rows, '2026-Q2');

const audit = {
  generated_at: new Date().toISOString(),
  ciclo: '2026-Q2',
  raw_rows_in_canonical_cycle: rows.filter(
    (r) =>
      (r.nps_cycle === '2026-Q2' ||
        r.nps_cycle === 'NPS-2026-JUN-JUL-PHARUS' ||
        r.nps_cycle === 'Onda 1 (jun a jul/26)') &&
      r.score != null,
  ).length,
  valid_deduped: q2?.valid ?? 0,
  promotores: q2?.promotores ?? 0,
  neutros: q2?.neutros ?? 0,
  detratores: q2?.detratores ?? 0,
  pct_promotores: q2?.pct_promotores,
  pct_neutros: q2?.pct_neutros,
  pct_detratores: q2?.pct_detratores,
  nps_derivado: q2?.nps_derivado,
  detractors,
};

const outPath = join(root, 'data/quality/historico_2026_q2_pnd_audit.json');
writeFileSync(outPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
console.log(JSON.stringify({ valid: audit.valid_deduped, det: audit.detratores, nps: audit.nps_derivado }));
