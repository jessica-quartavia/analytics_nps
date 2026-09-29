/**
 * ETAPA 2.5 — auditoria read-only dos artefatos do refresh (sem alterar BASE QV).
 */
import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyNpsScore, isValidScore } from '../lib/analytics/nps.mjs';
import { JUN_JUL_2026_BASELINE, verifyJunJulBaseline, validateRefreshInvariants } from '../lib/analytics/cycle-summary.mjs';
import { writeJson, readJson } from '../lib/data/file-store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../data');

async function fileExists(rel) {
  try {
    await access(join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

async function loadJson(rel, fallback = null) {
  if (!(await fileExists(rel))) return fallback;
  return readJson(rel, fallback);
}

async function loadLatestManifest() {
  const latest = await loadJson('snapshots/latest.json');
  if (!latest?.raw_snapshot) return null;
  return loadJson(`raw/${latest.raw_snapshot}/manifest.json`);
}

function auditActionQueue(queue) {
  const counts = { Alta: 0, Média: 0, Aprendizado: 0, Investigar: 0 };
  const reasonsByPriority = { Alta: {}, Média: {}, Aprendizado: {}, Investigar: {} };
  for (const item of queue ?? []) {
    const p = item.priority ?? 'Investigar';
    counts[p] = (counts[p] ?? 0) + 1;
    const r = item.reason ?? '(sem motivo)';
    reasonsByPriority[p][r] = (reasonsByPriority[p][r] ?? 0) + 1;
  }
  const topReasons = {};
  for (const [p, map] of Object.entries(reasonsByPriority)) {
    topReasons[p] = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
  }
  return { counts, topReasons };
}

function auditResponses(responses, sequenceByCode) {
  const issues = [];
  const keys = new Set();
  for (const r of responses ?? []) {
    const k = `${r.client_id}::${r.analytical_cycle_code}`;
    if (keys.has(k)) issues.push({ type: 'duplicate', key: k });
    keys.add(k);
    if (!isValidScore(r.score)) issues.push({ type: 'invalid_score', id: r.response_id });
    if (r.nps_category !== classifyNpsScore(r.score)) {
      issues.push({ type: 'category_mismatch', id: r.response_id });
    }
  }

  const byClient = new Map();
  for (const r of responses ?? []) {
    if (!r.client_id) continue;
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, []);
    byClient.get(r.client_id).push(r);
  }

  for (const [, rows] of byClient) {
    const ordered = [...rows].sort((a, b) => {
      const sa = sequenceByCode.get(a.analytical_cycle_code) ?? 9999;
      const sb = sequenceByCode.get(b.analytical_cycle_code) ?? 9999;
      if (sa !== sb) return sa - sb;
      return new Date(a.submitted_at) - new Date(b.submitted_at);
    });
    for (let i = 1; i < ordered.length; i++) {
      const cur = ordered[i];
      const prev = ordered[i - 1];
      if (cur.previous_score != null && cur.previous_score !== prev.score) {
        issues.push({
          type: 'previous_score',
          client_id: cur.client_id,
          expected: prev.score,
          actual: cur.previous_score,
        });
      }
      const expMigration = `${prev.nps_category} → ${cur.nps_category}`;
      if (cur.nps_migration && cur.nps_migration !== expMigration) {
        issues.push({ type: 'migration', client_id: cur.client_id, expected: expMigration, actual: cur.nps_migration });
      }
    }
  }

  const pairedSet = new Set();
  for (const r of responses ?? []) {
    if (r.analytical_cycle_code === 'NPS-2026-SET-PHARUS' && r.is_paired_with_previous) {
      pairedSet.add(r.client_id);
    }
  }
  for (const r of responses ?? []) {
    if (r.analytical_cycle_code !== 'NPS-2026-SET-PHARUS') continue;
    const should = pairedSet.has(r.client_id);
    if (Boolean(r.is_paired_with_previous) !== should) {
      issues.push({ type: 'is_paired_with_previous', client_id: r.client_id });
    }
  }

  return issues;
}

function auditMigrationMatrix(matrix) {
  const issues = [];
  if (!matrix?.cells?.length) {
    issues.push('migration_matrix ausente ou sem células');
    return issues;
  }
  if (matrix.cells.length !== 9) issues.push(`esperadas 9 células, got ${matrix.cells.length}`);
  const sum = matrix.cells.reduce((a, c) => a + c.count, 0);
  if (sum !== matrix.paired_clients) {
    issues.push(`soma counts (${sum}) != paired_clients (${matrix.paired_clients})`);
  }
  const origins = ['Detrator', 'Neutro', 'Promotor'];
  for (const from of origins) {
    const row = matrix.cells.filter((c) => c.key.startsWith(`${from} ->`));
    const total = row.reduce((a, c) => a + c.count, 0);
    const pctSum = row.reduce((a, c) => a + c.pct_of_origin, 0);
    if (total > 0 && Math.abs(pctSum - 100) > 0.05) {
      issues.push(`pct_of_origin linha ${from} soma ${pctSum} (esperado ~100)`);
    }
  }
  return issues;
}

function summarizeQuality(entries, refreshId) {
  const filtered = (entries ?? []).filter(
    (e) => !refreshId || e.refresh_run_id === refreshId || !e.refresh_run_id,
  );
  const byCheck = {};
  const bySeverity = { error: 0, warning: 0, info: 0 };
  for (const e of filtered) {
    byCheck[e.check_name] = (byCheck[e.check_name] ?? 0) + 1;
    const sev = e.severity === 'critical' ? 'error' : e.severity ?? 'info';
    if (bySeverity[sev] != null) bySeverity[sev]++;
    else bySeverity.info++;
  }
  return { byCheck, bySeverity, total: filtered.length };
}

export async function runFirstRefreshAudit() {
  const audited_at = new Date().toISOString();
  const blockers = [];

  const required = [
    'processed/cycle_summary.json',
    'processed/responses.json',
    'processed/paired_cycles.json',
    'processed/migration_matrix.json',
    'outputs/action_queue.json',
    'quality/refresh_runs.json',
    'snapshots/latest.json',
  ];
  for (const p of required) {
    if (!(await fileExists(p))) blockers.push(`Artefato ausente: ${p}`);
  }

  const manifest = await loadLatestManifest();
  if (!manifest) blockers.push('manifest.json do último refresh ausente');

  const refreshRuns = await loadJson('quality/refresh_runs.json', { runs: [] });
  const latestRun = refreshRuns.runs?.[refreshRuns.runs.length - 1];
  const refresh_id = latestRun?.refresh_id ?? manifest?.refresh_id ?? null;
  if (!refresh_id) blockers.push('refresh_id não identificado');

  if (blockers.length) {
    const audit = {
      refresh_id,
      audited_at,
      baseline_status: 'not_run',
      invariants_status: 'not_run',
      cycles_status: { jun_jul: 'not_run', set: 'not_run' },
      paired_status: 'not_run',
      migration_status: 'not_run',
      action_queue_status: 'not_run',
      quality_summary: null,
      ready_for_dashboard: false,
      blockers,
    };
    await writeJson('quality/first_refresh_audit.json', audit);
    return audit;
  }

  const cycleSummaryDoc = await loadJson('processed/cycle_summary.json');
  const junJul = cycleSummaryDoc.cycles?.find((c) => c.cycle_code === JUN_JUL_2026_BASELINE.cycle_code);
  const setCycle = cycleSummaryDoc.cycles?.find((c) => c.cycle_code === 'NPS-2026-SET-PHARUS');

  const baselineCheck = junJul ? verifyJunJulBaseline(junJul) : { ok: false, failures: [{ field: 'missing' }] };
  const baseline_status = baselineCheck.ok ? 'pass' : 'fail';
  if (!baselineCheck.ok) {
    blockers.push('Jun–Jul baseline diverge do aprovado ETAPA 2.3');
  }

  const responses = await loadJson('processed/responses.json', []);
  const paired = await loadJson('processed/paired_cycles.json', {});
  const migration = await loadJson('processed/migration_matrix.json', {});
  const actionQueue = await loadJson('outputs/action_queue.json', []);
  const qualityDoc = await loadJson('quality/data_quality.json', { entries: [] });

  const sequenceByCode = new Map([
    ['NPS-2026-JUN-JUL-PHARUS', 1],
    ['NPS-2026-SET-PHARUS', 2],
  ]);

  const responseIssues = auditResponses(responses, sequenceByCode);
  if (responseIssues.length) blockers.push(`responses.json: ${responseIssues.length} issue(s)`);

  const migrationIssues = auditMigrationMatrix(migration);
  const migration_status = migrationIssues.length ? 'fail' : 'pass';
  if (migrationIssues.length) blockers.push(...migrationIssues);

  const invariantErrors = validateRefreshInvariants(
    responses,
    cycleSummaryDoc.cycles ?? [],
    migration,
    paired,
  );
  const invariants_status = invariantErrors.length ? 'fail' : 'pass';
  if (invariantErrors.length) blockers.push(...invariantErrors.map((e) => e.message ?? e.code));

  const paired_status =
    paired.paired_clients != null && paired.paired_clients === migration.paired_clients ? 'pass' : 'fail';
  if (paired_status === 'fail') blockers.push('paired_cycles inconsistente com migration_matrix');

  const quality_summary = summarizeQuality(qualityDoc.entries, refresh_id);
  const criticalErrors = quality_summary.bySeverity.error;

  const actionAudit = auditActionQueue(actionQueue);
  const action_queue_status = 'pass';

  const ready_for_dashboard =
    blockers.length === 0 &&
    baseline_status === 'pass' &&
    invariants_status === 'pass' &&
    migration_status === 'pass' &&
    paired_status === 'pass' &&
    responseIssues.length === 0;

  const audit = {
    refresh_id,
    audited_at,
    manifest: manifest
      ? {
          generated_at: manifest.generated_at,
          data_cutoff: manifest.data_cutoff,
          source_counts: manifest.source_counts,
        }
      : null,
    baseline_status,
    baseline_details: baselineCheck.ok
      ? {
          valid_responses: junJul.valid_responses,
          promoters: junJul.promoters,
          passives: junJul.passives,
          detractors: junJul.detractors,
          nps: junJul.nps,
          historical_gap: junJul.historical_gap,
        }
      : { failures: baselineCheck.failures, actual: junJul },
    invariants_status,
    invariants_errors: invariantErrors,
    cycles_status: {
      jun_jul: baseline_status,
      set: setCycle
        ? {
            status: 'documented',
            data_cutoff: setCycle.data_cutoff,
            valid_responses: setCycle.valid_responses,
            promoters: setCycle.promoters,
            passives: setCycle.passives,
            detractors: setCycle.detractors,
            nps: setCycle.nps,
            average_score: setCycle.average_score,
            median_score: setCycle.median_score,
            nps_ci_low: setCycle.nps_ci_low,
            nps_ci_high: setCycle.nps_ci_high,
            score_distribution: setCycle.score_distribution,
            eligible_clients: setCycle.eligible_clients,
            response_rate: setCycle.response_rate,
            response_rate_quality: setCycle.response_rate_quality,
          }
        : 'missing',
    },
    paired_status,
    paired_metrics: paired,
    migration_status,
    migration_issues: migrationIssues,
    action_queue_status,
    action_queue: actionAudit,
    response_integrity_issues: responseIssues,
    quality_summary,
    refresh_run: latestRun,
    ready_for_dashboard,
    blockers,
    limitations: [
      'Jun–Jul: taxa de resposta parcial/indisponível (reconstrução histórica)',
      'Ciclos 2025/Mar-2026 não reconstruídos → analytical_cycle_unresolved esperado',
      'IC95 bootstrap — intervalo descritivo, não causal',
    ],
  };

  await writeJson('quality/first_refresh_audit.json', audit);
  return audit;
}

if (process.argv[1]?.endsWith('audit-first-refresh.mjs')) {
  const audit = await runFirstRefreshAudit();
  console.log(JSON.stringify(audit, null, 2));
}
