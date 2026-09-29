/**
 * Auditoria read-only — população NPS PHARUS (Set/2026 + Jun–Jul).
 * Não altera cálculos nem datasets processados.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAnalyticalCycleConfig,
  resolveCycleBounds,
  matchesAnalyticalCycle,
  dedupeByClientAndAnalyticalCycle,
} from '../lib/analytics/analytical-cycles.mjs';
import {
  classifyNpsScore,
  isValidScore,
  calculateNpsSummary,
} from '../lib/analytics/nps.mjs';
import { analyticalCyclesForSourceSend } from '../lib/pipeline/analytical-response-builder.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SET_CODE = 'NPS-2026-SET-PHARUS';
const JUN_CODE = 'NPS-2026-JUN-JUL-PHARUS';
const T3_SOURCE_ID = '7f9f8b42-84ae-4e00-a408-d22bea7c4407';
const HIST_CUT_26SEP_BRT_END = '2026-09-27T02:59:59.999Z';

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function normProgram(p) {
  return (p ?? '').trim().toUpperCase();
}

function countByProgram(rows, field = 'program') {
  const out = { PHARUS: 0, DAVOS: 0, other: 0, missing: 0 };
  for (const r of rows) {
    const p = normProgram(r[field] ?? r.programa);
    if (p === 'PHARUS') out.PHARUS++;
    else if (p === 'DAVOS') out.DAVOS++;
    else if (!p) out.missing++;
    else out.other++;
  }
  return out;
}

function statusBuckets(rows) {
  const buckets = {};
  for (const r of rows) {
    const s = (r.status ?? r.journey_stage ?? '—').toString().trim() || 'missing';
    buckets[s] = (buckets[s] ?? 0) + 1;
  }
  return buckets;
}

function davosScanArtifact(name, rows, programField = 'program') {
  const prog = countByProgram(rows, programField);
  return { artifact: name, rows: rows?.length ?? 0, ...prog };
}

function scoreDistribution(rows) {
  const dist = Object.fromEntries([...Array(11).keys()].map((k) => [String(k), 0]));
  for (const r of rows) {
    if (!isValidScore(r.score)) continue;
    dist[String(r.score)]++;
  }
  return dist;
}

function runSetDedupeFromIngest(setDef, sourceCycles, clientsMap) {
  const r1 = readJson('data/ingest/partials/nps_responses_1.json');
  const r2 = readJson('data/ingest/partials/nps_responses_2.json');
  const raw = [...r1, ...r2];
  const staged = [];
  for (const src of raw) {
    const client = clientsMap.get(src.client_id);
    if (!client || !isValidScore(src.score)) continue;
    if (!matchesAnalyticalCycle(src, client, setDef, sourceCycles)) continue;
    staged.push({
      client_id: src.client_id,
      client_name: client.name ?? src.client_name,
      analytical_cycle_code: setDef.cycle_code,
      submitted_at: src.submitted_at,
      score: src.score,
      program: client.programa,
      source_response_id: src.id,
      nps_category: classifyNpsScore(src.score),
    });
  }
  const { kept, removed } = dedupeByClientAndAnalyticalCycle(staged);
  return {
    raw_rows_in_window: staged.length,
    duplicates_found: removed.length,
    rows_removed: removed.length,
    final_rows: kept.length,
    duplicate_details: removed.map((d) => ({
      client_id: d.removed.client_id,
      client_name: d.removed.client_name,
      kept_submitted_at: d.kept.submitted_at,
      removed_submitted_at: d.removed.submitted_at,
      kept_score: d.kept.score,
      removed_score: d.removed.score,
    })),
    final_responses: kept,
  };
}

function buildEligibleFromSends(analyticalConfig, sends, clientsMap) {
  const rows = [];
  for (const send of sends) {
    const client = clientsMap.get(send.client_id);
    if (!client) continue;
    const codes = analyticalCyclesForSourceSend(send.cycle_id, client, analyticalConfig);
    for (const analytical_cycle_code of codes) {
      if (analytical_cycle_code !== SET_CODE) continue;
      rows.push({
        client_id: send.client_id,
        client_name: client.name,
        program: client.programa,
        status: client.status,
        sent_at: send.sent_at,
        source_cycle_id: send.cycle_id,
      });
    }
  }
  return rows;
}

function main() {
  const errors = [];
  const warnings = [];
  const config = loadAnalyticalCycleConfig();
  const setDef = config.find((c) => c.cycle_code === SET_CODE);
  const junDef = config.find((c) => c.cycle_code === JUN_CODE);
  const sourceCycles = readJson('data/ingest/partials/nps_cycles.json');
  const setBounds = resolveCycleBounds(setDef, sourceCycles);

  const responses = readJson('data/processed/responses.json');
  const setResponses = responses.filter((r) => r.analytical_cycle_code === SET_CODE);
  const junResponses = responses.filter((r) => r.analytical_cycle_code === JUN_CODE);

  const cycleSummary = readJson('data/processed/cycle_summary.json');
  const setSummary = cycleSummary.cycles?.find((c) => c.cycle_code === SET_CODE);
  const junSummary = cycleSummary.cycles?.find((c) => c.cycle_code === JUN_CODE);

  const eligibleAll = readJson('data/processed/eligible_clients.json');
  const setEligible = eligibleAll.filter((e) => e.analytical_cycle_code === SET_CODE);

  const clients = readJson('data/ingest/partials/clients.json');
  const clientsMap = new Map(clients.map((c) => [c.id, c]));
  const sends = readJson('data/ingest/partials/nps_sends.json');
  const t3Sends = sends.filter((s) => s.cycle_id === T3_SOURCE_ID);

  const dedupe = runSetDedupeFromIngest(setDef, sourceCycles, clientsMap);
  const qaSummary = calculateNpsSummary(setResponses.map((r) => ({ score: r.score })));
  const dist = scoreDistribution(setResponses);

  const distinctClients = new Set(setResponses.map((r) => r.client_id));
  const programResp = countByProgram(setResponses);

  const eligibleDistinct = new Set(setEligible.map((e) => e.client_id));
  const sendDup = new Map();
  for (const e of setEligible) {
    sendDup.set(e.client_id, (sendDup.get(e.client_id) ?? 0) + 1);
  }
  const duplicateEligibleClients = [...sendDup.entries()]
    .filter(([, c]) => c > 1)
    .map(([client_id, send_count]) => {
      const row = setEligible.find((e) => e.client_id === client_id);
      return { client_id, client_name: row?.client_name, send_count };
    });

  const eligibleRebuilt = buildEligibleFromSends(config, t3Sends, clientsMap);
  const eligibleProg = countByProgram(setEligible);
  const eligibleStatus = statusBuckets(setEligible);

  const eligibleIds = new Set(setEligible.map((e) => e.client_id));
  const inEligible = setResponses.filter((r) => eligibleIds.has(r.client_id));
  const outsideEligible = setResponses.filter((r) => !eligibleIds.has(r.client_id));

  const rateRecalc = setEligible.length ? inEligible.length / setEligible.length : null;

  const histCut = new Date(HIST_CUT_26SEP_BRT_END).getTime();
  const histRef = {
    cutoff_note: 'Fim do dia 26/09/2026 (BRT) → 2026-09-27T02:59:59.999Z',
    reference: {
      valid_responses: 248,
      eligible_sends: 961,
      nps_approx: 56,
      promoters: 170,
      passives: 47,
      detractors: 31,
    },
  };
  const atCut = dedupe.final_responses.filter(
    (r) => new Date(r.submitted_at).getTime() <= histCut,
  );
  const afterCut = dedupe.final_responses.filter(
    (r) => new Date(r.submitted_at).getTime() > histCut,
  );
  afterCut.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));

  const histAtCutSummary = calculateNpsSummary(atCut.map((r) => ({ score: r.score })));
  const deltaPnD = {
    promoters: qaSummary.promoters - histRef.reference.promoters,
    passives: qaSummary.passives - histRef.reference.passives,
    detractors: qaSummary.detractors - histRef.reference.detractors,
    responses: qaSummary.total - histRef.reference.valid_responses,
    eligible: setEligible.length - histRef.reference.eligible_sends,
  };

  const cross = [];
  const paired = readJson('data/processed/paired_cycles.json');
  cross.push(davosScanArtifact('responses.json (SET)', setResponses));
  cross.push(davosScanArtifact('responses.json (JUN)', junResponses));
  cross.push(davosScanArtifact('eligible_clients.json (SET)', setEligible));
  try {
    const topics = readJson('data/processed/response_topics.json');
    const topicRespIds = new Set(topics.map((t) => t.response_id));
    const topicRows = setResponses.filter((r) => topicRespIds.has(r.response_id));
    cross.push(davosScanArtifact('response_topics (SET responses)', topicRows));
  } catch {
    warnings.push('response_topics.json ausente — skip DAVOS scan');
  }
  try {
    const drivers = readJson('data/processed/driver_features.json');
    const setDrv = Array.isArray(drivers)
      ? drivers.filter((e) => e.analytical_cycle_code === SET_CODE)
      : (drivers.entries ?? []).filter((e) => e.analytical_cycle_code === SET_CODE || e.cycle_code === SET_CODE);
    cross.push(davosScanArtifact('driver_features (SET)', setDrv));
  } catch {
    warnings.push('driver_features.json ausente ou formato inesperado');
  }
  try {
    const aq = readJson('data/processed/action_queue_enriched.json');
    cross.push(davosScanArtifact('action_queue_enriched (SET)', aq.entries ?? []));
  } catch {
    warnings.push('action_queue_enriched.json ausente');
  }
  try {
    const ep = readJson('data/processed/ep_summary.json');
    const setEp = (ep.entries ?? []).filter((e) => e.cycle_code === SET_CODE);
    cross.push({ artifact: 'ep_summary (SET)', rows: setEp.length, note: 'EP rows — program on response join' });
  } catch {
    warnings.push('ep_summary.json ausente');
  }

  for (const c of cross) {
    if (c.DAVOS > 0) errors.push(`DAVOS em ${c.artifact}: ${c.DAVOS} linhas`);
  }

  const expected = {
    valid_responses: 253,
    promoters: 174,
    passives: 47,
    detractors: 32,
    nps: 56.1,
    eligible_clients: 967,
    response_rate_pct: 26.2,
    paired_clients: 81,
  };

  if (setResponses.length !== 253) {
    errors.push(`Respostas SET: esperado 253, encontrado ${setResponses.length}`);
  }
  if (distinctClients.size !== setResponses.length) {
    errors.push(`client_id duplicado em responses: ${setResponses.length - distinctClients.size}`);
  }
  if (programResp.DAVOS > 0) errors.push(`DAVOS em respondentes: ${programResp.DAVOS}`);
  if (qaSummary.promoters !== 174 || qaSummary.passives !== 47 || qaSummary.detractors !== 32) {
    errors.push(
      `P/N/D diverge: ${qaSummary.promoters}/${qaSummary.passives}/${qaSummary.detractors} vs 174/47/32`,
    );
  }
  if (Math.abs(qaSummary.nps - ((174 - 32) / 253) * 100) > 0.001) {
    errors.push('NPS QA não fecha com P/N/D');
  }
  if (setSummary && Math.abs(setSummary.nps - qaSummary.nps) > 0.001) {
    errors.push(`NPS cycle_summary diverge do recálculo: ${setSummary.nps} vs ${qaSummary.nps}`);
  }
  if (setEligible.length !== 967) {
    errors.push(`eligible_clients: esperado 967, encontrado ${setEligible.length}`);
  }
  if (eligibleDistinct.size !== setEligible.length) {
    errors.push(
      `Denominador mistura envios: ${setEligible.length} linhas, ${eligibleDistinct.size} clientes únicos`,
    );
  }
  if (eligibleProg.DAVOS > 0) errors.push(`DAVOS na base elegível: ${eligibleProg.DAVOS}`);
  if (outsideEligible.length > 0) {
    warnings.push(
      `${outsideEligible.length} respondente(s) fora de eligible_clients — ver lista`,
    );
  }
  const netNewVsHist = qaSummary.total - histRef.reference.valid_responses;
  if (netNewVsHist !== afterCut.length) {
    warnings.push(
      `Delta total vs histórico: +${netNewVsHist} respostas; ${afterCut.length} com submitted_at após fim do dia 26/09 (BRT) — diferença explicada por corte horário do snapshot histórico (~248) vs fim do dia civil`,
    );
  }

  const outOfWindow = setResponses.filter((r) => {
    const t = new Date(r.submitted_at).getTime();
    const s = setBounds.starts_at ? new Date(setBounds.starts_at).getTime() : -Infinity;
    const e = setBounds.ends_at ? new Date(setBounds.ends_at).getTime() : Infinity;
    return t < s || t > e;
  });

  if (outOfWindow.length) {
    errors.push(`${outOfWindow.length} resposta(s) SET fora da janela ends_at configurada`);
  }

  const status = errors.length ? 'ERROR' : warnings.length ? 'WARNING' : 'PASS';

  const doc = {
    audited_at: new Date().toISOString(),
    scope: 'PHARUS only — DAVOS excluded from analytical cycles',
    status,
    set_2026: {
      dashboard_reference: expected,
      cycle_summary_snapshot: setSummary,
      data_cutoff: cycleSummary.data_cutoff,
    },
    responses: {
      respondents_total: setResponses.length,
      respondents_distinct_clients: distinctClients.size,
      respondents_pharus: programResp.PHARUS,
      respondents_davos: programResp.DAVOS,
      respondents_program_missing: programResp.missing,
      submitted_at_in_cycle_window: setResponses.length - outOfWindow.length,
      submitted_at_outside_window: outOfWindow.length,
      qa_recalc: qaSummary,
    },
    dedupe: {
      rule: 'client_id + analytical_cycle_code — mantém submitted_at mais recente',
      from_ingest_nps_responses: dedupe,
      processed_matches_ingest_dedupe: setResponses.length === dedupe.final_rows,
    },
    score_distribution: {
      from_responses: dist,
      from_cycle_summary: setSummary?.score_distribution ?? null,
      sum: Object.values(dist).reduce((a, b) => a + b, 0),
      detractors_0_6: [0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + dist[String(k)], 0),
      neutrals_7_8: [7, 8].reduce((s, k) => s + dist[String(k)], 0),
      promoters_9_10: [9, 10].reduce((s, k) => s + dist[String(k)], 0),
    },
    classification: {
      qa_promoters: qaSummary.promoters,
      qa_passives: qaSummary.passives,
      qa_detractors: qaSummary.detractors,
      nps_formula: `(${qaSummary.promoters} - ${qaSummary.detractors}) / ${qaSummary.total} * 100 = ${qaSummary.nps}`,
      matches_dashboard: qaSummary.promoters === 174 && qaSummary.passives === 47 && qaSummary.detractors === 32,
    },
    eligible: {
      meaning:
        'Uma linha por registro em nps_sends da campanha NPS 2026-T3 (source_cycle_id) cujo cliente é PHARUS — regra buildAnalyticalEligibleClients / analyticalCyclesForSourceSend',
      source_table: 'BASE QV public.nps_sends (ingest: data/ingest/partials/nps_sends.json)',
      source_file_ingest: 'data/ingest/partials/nps_sends.json',
      source_cycle_id: T3_SOURCE_ID,
      source_cycle_name: 'NPS 2026-T3',
      program_filter: 'client.programa === PHARUS (DAVOS sends ignorados — 0 linhas elegíveis)',
      cycle_filter: 'send.cycle_id ∈ source_cycle_ids do ciclo analítico SET',
      status_filter: 'nenhum — status do cliente registrado mas não excluído',
      dedupe_rule: 'nenhum na elegibilidade — 1 linha por send; no snapshot atual 967 sends = 967 clientes únicos',
      exclusion_rules: [
        'Cliente ausente em clients',
        'programa !== PHARUS (ex.: DAVOS)',
        'send não mapeado a ciclo analítico PHARUS',
      ],
      eligible_rows: setEligible.length,
      eligible_distinct_client_ids: eligibleDistinct.size,
      eligible_rows_rebuilt_from_ingest: eligibleRebuilt.length,
      duplicate_client_send_rows: duplicateEligibleClients,
      t3_sends_total_in_ingest: t3Sends.length,
      t3_sends_by_program: countByProgram(
        t3Sends.map((s) => ({ program: clientsMap.get(s.client_id)?.programa })),
      ),
    },
    program_audit: {
      eligible: eligibleProg,
      respondents: programResp,
    },
    status_audit: {
      eligible_client_status_field: statusBuckets(setEligible.map((e) => ({ status: e.status }))),
      note: 'Elegível = cliente PHARUS com nps_send na campanha T3, independente de status CRM',
    },
    response_rate: {
      responded_in_eligible_meta: setEligible.filter((e) => e.responded).length,
      eligible_clients: setEligible.length,
      rate_decimal: rateRecalc,
      rate_pct: rateRecalc != null ? Math.round(rateRecalc * 1000) / 10 : null,
      ui_pct: 26.2,
      reconciles_with_253_967: Math.abs(rateRecalc - 253 / 967) < 0.0001,
    },
    respondents_vs_eligible: {
      respondents_in_eligible: inEligible.length,
      respondents_outside_eligible: outsideEligible.length,
      outside_list: outsideEligible.map((r) => ({
        client_id: r.client_id,
        client_name: r.client_name,
        submitted_at: r.submitted_at,
        score: r.score,
        program: r.program,
      })),
    },
    paired: {
      paired_clients: paired.paired_clients,
      expected: 81,
    },
    historical_comparison: {
      ...histRef,
      at_cut_from_ingest: {
        count: atCut.length,
        pnd: histAtCutSummary,
      },
      delta_vs_reference: deltaPnD,
      new_respondents_after_cut: afterCut.map((r) => ({
        client_name: r.client_name,
        client_id: r.client_id,
        submitted_at: r.submitted_at,
        score: r.score,
        category: r.nps_category,
        program: r.program,
      })),
      pnd_delta_from_new_only: calculateNpsSummary(afterCut.map((r) => ({ score: r.score }))),
    },
    jun_jul: {
      cycle_summary: junSummary,
      responses_count: junResponses.length,
      distinct_clients: new Set(junResponses.map((r) => r.client_id)).size,
      program: countByProgram(junResponses),
      qa_nps: calculateNpsSummary(junResponses.map((r) => ({ score: r.score }))),
    },
    cross_artifact: cross,
    warnings,
    errors,
  };

  mkdirSync(join(ROOT, 'data/quality'), { recursive: true });
  const outPath = join(ROOT, 'data/quality/nps_population_audit.json');
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status, outPath, errors, warnings: warnings.length }, null, 2));
  if (status === 'ERROR') process.exit(1);
}

main();
