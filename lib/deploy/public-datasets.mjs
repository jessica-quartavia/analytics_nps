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
export const OPTIONAL_PUBLIC_DATASETS = ['operational/action_tracking.json'];

export function publicUrlForDataset(dataRel) {
  return `/data/${dataRel}`;
}
