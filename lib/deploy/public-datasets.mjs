/**
 * Datasets servidos em /data/* no deploy estático.
 * Mantido alinhado ao boot em dashboard/js/data/analytics-store.js
 */

/** fetchJson — falha o boot se 404 */
export const REQUIRED_BOOT_DATASETS = [
  'processed/cycles.json',
  'processed/responses.json',
  'processed/cycle_summary.json',
  'processed/paired_cycles.json',
  'processed/migration_matrix.json',
  'processed/eligible_clients.json',
  'outputs/action_queue.json',
  'quality/data_quality.json',
  'snapshots/latest.json',
];

/** fetchJsonOptional — páginas completas; obrigatórios no dist de produção */
export const REQUIRED_PUBLIC_DATASETS = [
  ...REQUIRED_BOOT_DATASETS,
  'processed/ep_summary.json',
  'processed/response_topics.json',
  'processed/topic_summary.json',
  'processed/csat_summary.json',
  'processed/client_satisfaction_summary.json',
  'processed/driver_tests.json',
  'processed/drivers_summary.json',
  'processed/comment_drivers.json',
  'processed/action_queue_enriched.json',
  'processed/executive_diagnosis.json',
];

/** Opcional no boot; copiado se existir */
export const OPTIONAL_PUBLIC_DATASETS = [
  'operational/action_tracking.json',
  'quality/nps_population_audit.json',
  'processed/nps_client_milestones.json',
  'processed/nps_milestones_summary.json',
  'processed/nps_between_cycle_events.json',
  'quality/nps_milestones_qa.json',
  'processed/nps_change_drivers.json',
  'quality/nps_change_drivers_qa.json',
  'processed/nps_financial_profile.json',
  'quality/nps_financial_profile_qa.json',
  'processed/nps_management_insights.json',
  'quality/nps_management_insights_qa.json',
  'processed/customer_nps_cohorts.json',
  'processed/customer_nps_history.json',
  'processed/safras_cobertura_summaries.json',
  'quality/safras_cobertura_audit.json',
  'processed/historical_nps_summary.json',
  'processed/historical_nps_responses.json',
  'processed/historical_nps_clients.json',
  'processed/historical_nps_field_coverage.json',
  'processed/historical_nps_enriched.json',
  'quality/historical_nps_enriched_quality.json',
  'quality/cohort_payment_date_audit.json',
  'processed/nps_all_periods.json',
  'quality/nps_all_periods_audit.json',
  'processed/nps_mechanisms_at_response.json',
  'processed/voc_all_periods.json',
  'quality/voc_base0_coverage.json',
  'processed/nps_prediction_next_cycle.json',
  'quality/nps_prediction_model_report.json',
  'processed/pharus_app_customer_match.json',
  'quality/pharus_app_match_audit.json',
];

export function publicUrlForDataset(dataRel) {
  return `/data/${dataRel}`;
}
