#!/usr/bin/env node
/**
 * Auditoria do cálculo NPS — recorte padrão (último ciclo PHARUS) e fatias.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateNpsFromResponses,
  dedupeLatestNpsByClient,
  npsClientId,
} from '../lib/analytics/nps.mjs';
import { filterNpsAllPeriods } from '../lib/analytics/nps-all-periods.mjs';
import { buildExecutiveNpsSideBySide } from '../lib/analytics/executive-current-nps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function sliceAudit(rows, label) {
  const input = rows ?? [];
  const valid = input.filter((r) => r.score != null || r.nota != null);
  const before = new Set(valid.map((r) => npsClientId(r)).filter(Boolean));
  const deduped = dedupeLatestNpsByClient(valid, { requireClientId: true });
  const afterIds = new Set(deduped.map((r) => npsClientId(r)).filter(Boolean));
  const duplicate_clients = [...before].filter((id) => {
    const n = valid.filter((r) => npsClientId(r) === id).length;
    return n > 1;
  }).length;
  const agg = aggregateNpsFromResponses(input, { dedupe: true });
  return {
    label,
    rows_input: input.length,
    valid_scores: valid.length,
    unique_clients_before_dedupe: before.size,
    duplicate_clients,
    rows_after_dedupe: deduped.length,
    promoters: agg.promoters,
    neutrals: agg.neutrals,
    detractors: agg.detractors,
    nps: agg.nps,
    responses: agg.responses,
  };
}

function main() {
  const responses = readJson('data/processed/responses.json');
  const cycles = readJson('data/processed/cycles.json');
  const cycleSummary = readJson('data/processed/cycle_summary.json');
  const npsAll = readJson('data/processed/nps_all_periods.json');

  const latest = [...cycles].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).at(-1);
  const cycleCode = latest?.cycle_code ?? 'NPS-2026-SET-PHARUS';
  const setRows = responses.filter((r) => r.analytical_cycle_code === cycleCode);
  const summarySnap = (cycleSummary.cycles ?? []).find((c) => c.cycle_code === cycleCode);

  const default_current = sliceAudit(setRows, 'default_current_cycle');
  default_current.cycle_code = cycleCode;
  default_current.cycle_summary_artifact = summarySnap
    ? {
        valid_responses: summarySnap.valid_responses,
        promoters: summarySnap.promoters,
        passives: summarySnap.passives,
        detractors: summarySnap.detractors,
        nps: summarySnap.nps,
      }
    : null;
  default_current.dashboard_executivo_nps_display = summarySnap?.nps ?? null;
  default_current.user_reference_nps = 58.4;
  default_current.user_reference_matched =
    default_current.nps != null && Math.abs(default_current.nps - 58.4) < 0.05;

  const by_cycle = {};
  for (const c of cycleSummary.cycles ?? []) {
    const rows = responses.filter((r) => r.analytical_cycle_code === c.cycle_code);
    by_cycle[c.cycle_code] = sliceAudit(rows, c.cycle_code);
  }

  const allPeriodRows = npsAll.responses ?? [];
  const by_source = {
    base0: sliceAudit(allPeriodRows.filter((r) => r.source === 'base0'), 'base0'),
    current: sliceAudit(allPeriodRows.filter((r) => r.source === 'current'), 'current'),
    all_union_rows: sliceAudit(allPeriodRows, 'nps_all_periods_union'),
  };

  const by_program = {
    PHARUS: sliceAudit(setRows.filter((r) => r.program === 'PHARUS'), 'SET_PHARUS'),
  };

  const epMap = new Map();
  for (const r of setRows) {
    const ep = r.ep_name || '(sem EP)';
    if (!epMap.has(ep)) epMap.set(ep, []);
    epMap.get(ep).push(r);
  }
  const by_ep = Object.fromEntries(
    [...epMap.entries()].map(([ep, rows]) => [ep, sliceAudit(rows, `EP:${ep}`)]),
  );

  const currentGlobal = sliceAudit(
    filterNpsAllPeriods(allPeriodRows, 'current'),
    'nps_period_current_global',
  );

  const executive_side_by_side = buildExecutiveNpsSideBySide(
    responses,
    cycleCode,
    summarySnap,
  );
  executive_side_by_side.user_reference_nps = 58.4;
  executive_side_by_side.user_reference_matched =
    executive_side_by_side.executive_current_global?.nps != null &&
    Math.abs(executive_side_by_side.executive_current_global.nps - 58.4) < 0.05;

  const report = {
    generated_at: new Date().toISOString(),
    methodology:
      'filterValid → dedupeLatestNpsByClient (client_id/base_qv_id, submitted_at/response_date) → NPS = 100×(P−D)/N',
    default_current,
    executive_side_by_side,
    current_global_deduped: currentGlobal,
    by_cycle,
    by_source,
    by_program,
    by_ep,
    cause_analysis: {
      dashboard_61_5_explanation:
        'Executivo (recorte padrão, Período NPS = Todos) exibe cycle_summary do ciclo Set/2026: 283 clientes únicos já deduplicados por client_id+ciclo no pipeline; NPS = (205−31)/283×100 ≈ 61,48 (UI 61,5).',
      user_58_4_note:
        'Aplicando a mesma regra oficial sobre responses.json do ciclo SET, o NPS permanece ≈61,5 — 58,4 não reproduzido neste dataset. Referência próxima: NPS atual global (source=current, dedupe por cliente em todos os ciclos) ≈58,7 (443 clientes). Universo N=250 com P/N/D 174/48/28 produziria 58,4, mas não corresponde ao ciclo SET atual (283).',
      duplicates_removed_in_default_cycle:
        default_current.rows_input - default_current.rows_after_dedupe,
    },
  };

  mkdirSync(join(ROOT, 'data/quality'), { recursive: true });
  const outPath = join(ROOT, 'data/quality/nps_calculation_audit.json');
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(ROOT, 'data/quality/executive_nps_side_by_side.json'),
    `${JSON.stringify(executive_side_by_side, null, 2)}\n`,
    'utf8',
  );

  const dupClients = [];
  const byClient = new Map();
  for (const r of setRows) {
    const id = npsClientId(r);
    if (!id) continue;
    if (!byClient.has(id)) byClient.set(id, []);
    byClient.get(id).push(r);
  }
  for (const [client_id, list] of byClient) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
    const selected = dedupeLatestNpsByClient(list, { requireClientId: true })[0];
    dupClients.push({
      client_id,
      response_count: list.length,
      responses: list.map((r) => ({
        date: r.submitted_at,
        score: r.score,
        cycle: r.analytical_cycle_code,
        source: r.source,
        response_id: r.response_id,
      })),
      selected_response: selected
        ? {
            date: selected.submitted_at,
            score: selected.score,
            response_id: selected.response_id,
          }
        : null,
    });
  }
  writeFileSync(
    join(ROOT, 'data/quality/nps_dedupe_audit.json'),
    `${JSON.stringify(
      {
        generated_at: report.generated_at,
        cycle_code: cycleCode,
        clients_with_multiple_in_cycle: dupClients.length,
        clients: dupClients,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log('Wrote', outPath);
  console.log('default NPS', default_current.nps, 'user ref 58.4 matched?', report.default_current.user_reference_matched);
}

main();
