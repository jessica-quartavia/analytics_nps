#!/usr/bin/env node
/**
 * data/quality/safras_nps_consistency_audit.json
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../lib/data/file-store.mjs';
import { readDataJson } from '../lib/deploy/build-input.mjs';
import { buildCohortSummaries } from '../dashboard/js/data/historico2-view.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAFRAS = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'];

function rowToAudit(r) {
  if (!r) return null;
  return {
    safra: r.entry_cohort,
    nps: r.nps,
    n: r.nps_responses,
    clients: r.clients,
    promoters: r.promoters,
    neutrals: r.neutrals,
    detractors: r.detractors,
    average_score: r.average_score,
  };
}

export async function generateSafrasNpsConsistencyAudit() {
  const historico2 = readDataJson(root, 'processed/historico2_clients_enriched.json', null);
  const clients = historico2?.clients ?? [];
  const historicoRows = buildCohortSummaries(clients, { chartsFrom2025: true });
  const safrasRows = buildCohortSummaries(clients, { chartsFrom2025: true });

  const bySafraH = new Map(historicoRows.map((r) => [r.entry_cohort, r]));
  const bySafraS = new Map(safrasRows.map((r) => [r.entry_cohort, r]));

  const comparisons = [];
  for (const safra of SAFRAS) {
    const h = bySafraH.get(safra);
    const s = bySafraS.get(safra);
    if (!h && !s) continue;
    const match = JSON.stringify(rowToAudit(h)) === JSON.stringify(rowToAudit(s));
    comparisons.push({
      safra,
      historico_nps: h?.nps ?? null,
      safras_nps: s?.nps ?? null,
      historico_n: h?.nps_responses ?? null,
      safras_n: s?.nps_responses ?? null,
      historico_clients: h?.clients ?? null,
      safras_clients: s?.clients ?? null,
      match,
    });
  }

  const q3 = bySafraH.get('2026-Q3');
  const q3Clients = clients.filter((c) => c.entry_cohort === '2026-Q3');

  const doc = {
    generated_at: new Date().toISOString(),
    kernel: 'buildCohortSummaries (historico2-view.mjs)',
    comparisons,
    safra_2026_q3: {
      clients_total: q3Clients.length,
      with_entry_date: q3Clients.filter((c) => c.entry_date).length,
      with_nps: q3Clients.filter((c) => c.nps_score != null).length,
      without_nps: q3Clients.filter((c) => c.nps_score == null).length,
      cohort: rowToAudit(q3),
    },
    universe: {
      base_qv_clients: clients.length,
      with_entry_date: clients.filter((c) => c.entry_date).length,
      without_entry_date: clients.filter((c) => !c.entry_date).length,
    },
  };

  await writeJson('quality/safras_nps_consistency_audit.json', doc);
  return doc;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateSafrasNpsConsistencyAudit()
    .then((d) => console.log(JSON.stringify({ ok: true, rows: d.comparisons.length }, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
