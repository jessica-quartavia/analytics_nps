import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const ESSENTIAL = [
  'data/processed/cycle_summary.json',
  'data/processed/responses.json',
  'data/processed/cycles.json',
  'data/processed/paired_cycles.json',
  'data/processed/ep_summary.json',
  'data/processed/topic_summary.json',
  'data/processed/csat_summary.json',
  'data/processed/drivers_summary.json',
  'data/processed/action_queue_enriched.json',
  'data/processed/executive_diagnosis.json',
  'data/snapshots/latest.json',
];

const OPTIONAL_UI = ['data/outputs/action_queue.json', 'data/operational/action_tracking.json'];

function readJson(rel, fallback = null) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { __parse_error: true };
  }
}

function fmtNps(n) {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Ciclo corrente para métricas operacionais — prioriza snapshots/latest.json. */
export function resolveCurrentCycleCode({ latest, paired, diagnosis, cycleSummary }) {
  return (
    latest?.cycle_code ??
    paired?.current_cycle ??
    diagnosis?.cycle_code ??
    cycleSummary?.cycles?.slice(-1)?.[0]?.cycle_code ??
    null
  );
}

/** Registro CSAT do ciclo em csat_summary.json (somente leitura). */
export function findCsatSummaryForCycle(csatSummaryDoc, cycleCode) {
  if (!cycleCode || !csatSummaryDoc?.cycles?.length) return null;
  const cycles = csatSummaryDoc.cycles;
  return (
    cycles.find((c) => c.analytical_cycle_code === cycleCode) ??
    cycles.find((c) => c.cycle_code === cycleCode) ??
    null
  );
}

export function formatCsatResponsesMetric(validResponses) {
  if (typeof validResponses === 'number' && Number.isFinite(validResponses)) {
    return String(validResponses);
  }
  return 'N/A';
}

export function runHealthcheck() {
  const errors = [];
  const warnings = [];

  for (const rel of ESSENTIAL) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) {
      errors.push({ code: 'missing_file', message: `Arquivo essencial ausente: ${rel}` });
      continue;
    }
    const data = readJson(rel);
    if (data?.__parse_error) {
      errors.push({ code: 'invalid_json', message: `JSON inválido: ${rel}` });
    }
  }

  const latest = readJson('data/snapshots/latest.json');
  if (!latest) {
    errors.push({ code: 'no_latest', message: 'data/snapshots/latest.json ausente' });
  } else if (latest.status !== 'success') {
    errors.push({
      code: 'refresh_not_success',
      message: `Último refresh status=${latest.status ?? 'unknown'} — não publicável`,
    });
  }

  const cycleSummary = readJson('data/processed/cycle_summary.json', { cycles: [] });
  const paired = readJson('data/processed/paired_cycles.json');
  const topicSummary = readJson('data/processed/topic_summary.json');
  const csatSummary = readJson('data/processed/csat_summary.json', { cycles: [] });
  const drivers = readJson('data/processed/drivers_summary.json');
  const actionEnriched = readJson('data/processed/action_queue_enriched.json', { entries: [] });
  const crossPage = readJson('data/quality/cross_page_consistency.json');
  const diagnosis = readJson('data/processed/executive_diagnosis.json');
  const methodology = readJson('data/config/methodology.json');

  const currentCycle = resolveCurrentCycleCode({
    latest,
    paired,
    diagnosis,
    cycleSummary,
  });
  const currentSummary = cycleSummary.cycles?.find((c) => c.cycle_code === currentCycle);

  if (!currentSummary?.valid_responses) {
    errors.push({ code: 'no_responses', message: 'NPS/ciclo atual sem valid_responses' });
  }

  if (crossPage?.status === 'fail') {
    errors.push({
      code: 'cross_page_fail',
      message: `cross_page_consistency fail (${crossPage.failures_count} divergências)`,
    });
  } else if (!crossPage) {
    warnings.push({ code: 'qa_not_run', message: 'Execute npm run qa:final para cross_page_consistency' });
  }

  if (!existsSync(join(ROOT, 'data/operational/action_tracking.json'))) {
    warnings.push({
      code: 'tracking_init',
      message: 'action_tracking.json ausente — será criado vazio no primeiro save',
    });
  }

  const flags = diagnosis?.quality?.flags ?? [];
  for (const f of flags) {
    if (['partial_cycle', 'high_ep_proxy', 'voc_unreviewed', 'csat_rule_ambiguous', 'driver_proxy_heavy', 'small_paired_base'].includes(f)) {
      warnings.push({ code: f, message: `Flag metodológica: ${f}` });
    }
  }

  const csatCycle = findCsatSummaryForCycle(csatSummary, currentCycle);
  const csatValidResponses =
    csatCycle && typeof csatCycle.valid_responses === 'number'
      ? csatCycle.valid_responses
      : null;
  const dashboardPath = join(ROOT, 'dashboard/js/data/analytics-store.js');
  if (existsSync(dashboardPath)) {
    const src = readFileSync(dashboardPath, 'utf8');
    if (/service_role|SUPABASE_SERVICE/i.test(src)) {
      errors.push({ code: 'secret_in_frontend', message: 'Referência a service_role no frontend' });
    }
  }

  const metrics = {
    cycle_code: currentCycle,
    cycle_name: currentSummary?.cycle_name ?? diagnosis?.cycle_name,
    data_cutoff: cycleSummary.data_cutoff ?? latest?.data_cutoff,
    generated_at: latest?.generated_at ?? latest?.at,
    nps: currentSummary?.nps,
    valid_responses: currentSummary?.valid_responses,
    paired_clients: paired?.paired_clients,
    voc_coverage_pct: topicSummary?.classification?.pct_coverage,
    csat_valid_responses: csatValidResponses,
    driver_tests: drivers?.tests_count,
    action_queue_total: actionEnriched?.entries?.length ?? actionEnriched?.meta?.total,
    cross_page_consistency: crossPage?.status?.toUpperCase() ?? 'N/A',
    last_refresh: latest?.status?.toUpperCase() ?? 'UNKNOWN',
    methodology,
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics,
  };
}

export function formatHealthcheckReport(result) {
  const m = result.metrics;
  const lines = [
    'Analytics NPS Healthcheck',
    '',
    `Cycle: ${m.cycle_name ?? m.cycle_code ?? '—'}`,
    `NPS: ${fmtNps(m.nps)}`,
    `Responses: ${m.valid_responses ?? '—'}`,
    `Paired: ${m.paired_clients ?? '—'}`,
    `VoC coverage: ${m.voc_coverage_pct != null ? `${fmtNps(m.voc_coverage_pct)}%` : '—'}`,
    `CSAT responses: ${formatCsatResponsesMetric(m.csat_valid_responses)}`,
    `Drivers tests: ${m.driver_tests ?? '—'}`,
    `Action queue: ${m.action_queue_total ?? '—'}`,
    `Cross-page consistency: ${m.cross_page_consistency}`,
    `Last refresh: ${m.last_refresh}`,
  ];
  if (result.warnings.length) {
    lines.push('', 'WARNINGS:');
    for (const w of result.warnings) lines.push(`  - [${w.code}] ${w.message}`);
  }
  if (result.errors.length) {
    lines.push('', 'ERRORS:');
    for (const e of result.errors) lines.push(`  - [${e.code}] ${e.message}`);
  }
  return lines.join('\n');
}

export function formatStatusShort(result) {
  const m = result.metrics;
  return [
    `Cycle: ${m.cycle_name ?? m.cycle_code ?? '—'}`,
    `Last refresh: ${m.last_refresh} (${m.generated_at ?? '—'})`,
    `NPS: ${fmtNps(m.nps)} | Responses: ${m.valid_responses ?? '—'}`,
    `QA cross-page: ${m.cross_page_consistency}`,
    `Action queue: ${m.action_queue_total ?? '—'}`,
    `Health: ${result.ok ? 'OK' : 'BLOCKED'}`,
  ].join('\n');
}
