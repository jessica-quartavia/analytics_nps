#!/usr/bin/env node
/**
 * data/quality/nps_cross_page_consistency_audit.json
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../lib/data/file-store.mjs';
import { readDataJson } from '../lib/deploy/build-input.mjs';
import { buildCrossPageConsistency } from '../lib/analytics/cross-page-consistency.mjs';
import {
  auditPairedClientsBetweenCycles,
  countRecurringFromEnrichedRows,
  diffClientIdSets,
} from '../lib/analytics/nps-paired-recurring-audit.mjs';
import { buildNpsByEntryCohort, buildNpsByCohort } from '../lib/analytics/nps-cohort-nps.mjs';
import {
  safrasCustomersFromHistorico2,
  npsBySafraFromHistorico2Clients,
} from '../dashboard/js/data/historico2-safras-adapter.mjs';
import { buildExecutiveCurrentNpsSummary } from '../dashboard/js/data/executive-official-nps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function generateNpsCrossPageAudit() {
  const responses = readDataJson(root, 'processed/responses.json', []);
  const cycles = readDataJson(root, 'processed/cycles.json', []);
  const cycleSummaryDoc = readDataJson(root, 'processed/cycle_summary.json', {});
  const pairedCyclesDoc = readDataJson(root, 'processed/paired_cycles.json', null);
  const migrationMatrixDoc = readDataJson(root, 'processed/migration_matrix.json', null);
  const historico2 = readDataJson(root, 'processed/historico2_clients_enriched.json', null);
  const enriched = readDataJson(root, 'processed/historical_nps_enriched.json', null);
  const consolidated = readDataJson(root, 'processed/nps_measurements_consolidated.json', null);
  const safras = readDataJson(root, 'processed/safras_cobertura_summaries.json', null);

  const cycleCode = pairedCyclesDoc?.current_cycle ?? cycles.at(-1)?.cycle_code;
  const prevCode = pairedCyclesDoc?.previous_cycle;
  const summary = (cycleSummaryDoc?.cycles ?? []).find((c) => c.cycle_code === cycleCode);
  const cycleDef = cycles.find((c) => c.cycle_code === cycleCode);

  const pairedAudit =
    prevCode && cycleCode
      ? auditPairedClientsBetweenCycles(prevCode, cycleCode, responses)
      : null;

  const enrichedRows = (enriched?.responses ?? enriched ?? []).filter(Boolean);
  const recurring = countRecurringFromEnrichedRows(enrichedRows);
  const pairedSet = new Set(pairedAudit?.paired_client_ids ?? []);
  const recurringSet = new Set(recurring.recurring_client_ids);
  const pairedVsRecurring = diffClientIdSets(recurringSet, pairedSet);

  const executive = buildExecutiveCurrentNpsSummary(responses, summary, cycleDef);

  const historicoClients = historico2?.clients ?? [];
  const safra2026Q3Clients = historicoClients.filter((c) => c.entry_cohort === '2026-Q3');
  const safra2026Q3WithNps = safra2026Q3Clients.filter((c) => c.nps_score != null);
  const cohortFromHelper = buildNpsByCohort(historicoClients, { minYear: 2025 });
  const safrasCohortView = historico2
    ? npsBySafraFromHistorico2Clients(safrasCustomersFromHistorico2(historico2), { minYear: 2025 })
    : [];
  const cohortQ3 = cohortFromHelper.find((r) => r.safra === '2026-Q3');
  const cohortParity =
    JSON.stringify(cohortFromHelper) === JSON.stringify(safrasCohortView);

  const cross = buildCrossPageConsistency({
    cycleCode,
    cycleSummaryDoc,
    pairedCyclesDoc,
    migrationMatrixDoc,
    epSummaryDoc: readDataJson(root, 'processed/ep_summary.json', null),
    topicSummaryDoc: readDataJson(root, 'processed/topic_summary.json', null),
    actionQueueEnrichedDoc: readDataJson(root, 'processed/action_queue_enriched.json', null),
    executiveDiagnosisDoc: readDataJson(root, 'processed/executive_diagnosis.json', null),
    csatSummaryDoc: readDataJson(root, 'processed/csat_summary.json', null),
    driversSummaryDoc: readDataJson(root, 'processed/drivers_summary.json', null),
    responses,
  });

  const currentConsolidated = consolidated?.measurements?.find(
    (m) => m.cycle === consolidated?.meta?.current_cycle_label,
  );

  const checks = [
    {
      id: 'executive_vs_historico_current_responses',
      status: 'EXPECTED_DIFFERENCE',
      executive: executive.valid_responses,
      historico_consolidated: currentConsolidated?.responses ?? null,
      note:
        'Executivo = respostas válidas no ciclo analítico PHARUS (ex.: SET). Histórico consolidado 2026-Q3 = medição oficial BASE QV (408). Universos distintos por design.',
    },
    {
      id: 'movement_paired_vs_historico_recurring',
      status:
        pairedAudit?.paired_total === recurring.recurring_clients
          ? 'MATCH'
          : 'EXPECTED_DIFFERENCE',
      movement_paired: pairedAudit?.paired_total ?? null,
      historico_recurring: recurring.recurring_clients,
      diff: pairedVsRecurring,
      note: `${recurring.definition} | Pareados: ${pairedAudit?.definition ?? ''}`,
    },
    {
      id: 'paired_kernel_vs_materialized',
      status:
        pairedAudit?.paired_total === pairedCyclesDoc?.paired_clients ? 'MATCH' : 'ERROR',
      kernel: pairedAudit?.paired_total,
      paired_cycles_json: pairedCyclesDoc?.paired_clients,
    },
    {
      id: 'paired_cycles_vs_migration',
      status:
        pairedAudit?.paired_total === migrationMatrixDoc?.paired_clients ? 'MATCH' : 'ERROR',
      paired_kernel: pairedAudit?.paired_total,
      migration_matrix: migrationMatrixDoc?.paired_clients,
    },
    {
      id: 'nps_by_cohort_historico_vs_safras',
      status: cohortParity ? 'MATCH' : 'ERROR',
      historico_rows: cohortFromHelper.length,
      safras_view_rows: safrasCohortView.length,
    },
    {
      id: 'safra_2026_q3_clients',
      status: 'INFO',
      clients_entry_cohort_2026_q3: safra2026Q3Clients.length,
      with_nps_score_on_pack: safra2026Q3WithNps.length,
      cohort_helper_n_responses: cohortQ3?.n ?? null,
      note: 'Clientes da safra = entry_cohort; n NPS = clientes com nota considerada no pack (última/ciclo).',
    },
  ];

  const doc = {
    generated_at: new Date().toISOString(),
    current_cycle: cycleCode,
    executive_current: {
      valid_responses: executive.valid_responses,
      nps: executive.nps,
    },
    movement_paired: pairedAudit,
    historico_recurring: recurring,
    historico_current: {
      cycle_responses_kpi: executive.valid_responses,
      consolidated_last: currentConsolidated,
    },
    safra_summary: {
      cohort_rows_2025_plus: cohortFromHelper,
      safras_view_cohort_rows: safrasCohortView,
      safras_doc_meta: safras?.meta ?? null,
    },
    paired_vs_recurring: pairedVsRecurring,
    journey_flags: (() => {
      const milestones = readDataJson(root, 'processed/nps_client_milestones.json', null);
      const rows = (milestones?.entries ?? []).filter((r) => r.analytical_cycle_code === cycleCode);
      const flag = (field) => {
        let t = 0;
        let f = 0;
        let n = 0;
        for (const r of rows) {
          const v = r[field];
          if (v === true) t++;
          else if (v === false) f++;
          else n++;
        }
        return { true: t, false: f, null: n, total: rows.length };
      };
      return {
        cycle: cycleCode,
        ever_changed_ep_before_response: flag('ever_changed_ep_before_response'),
        changed_ep_since_previous_response: flag('changed_ep_since_previous_response'),
        frozen_at_response: flag('frozen_at_response'),
        churn_requested_before_response: flag('churn_requested_before_response'),
        app_pharus_access: flag('app_pharus_access'),
        milestones_qa: readDataJson(root, 'quality/nps_milestones_qa.json', null)?.coverage_by_field ?? null,
      };
    })(),
    cross_page_checks: cross.checks ?? cross,
    audit_checks: checks,
    paired_vs_recurring_diff: pairedVsRecurring,
  };

  await writeJson('quality/nps_cross_page_consistency_audit.json', doc);
  return doc;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateNpsCrossPageAudit()
    .then((d) => console.log(JSON.stringify({ ok: true, checks: d.audit_checks }, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
