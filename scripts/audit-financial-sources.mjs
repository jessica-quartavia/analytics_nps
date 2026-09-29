#!/usr/bin/env node
/**
 * ETAPA 4.6 — auditoria Tier / reserva / aporte / débitos.
 * Não altera dashboard. Gera quality/nps_financial_sources_audit.json
 * Requer export opcional: data/raw/<snapshot>/client_financial_data.json
 */
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { mannWhitneyU } from '../lib/analytics/driver-stats.mjs';
import { classifyNpsScore } from '../lib/analytics/nps.mjs';

const COVERAGE_GOOD = 80;
const COVERAGE_PARTIAL = 50;

function qualityLabel(pct) {
  if (pct == null) return 'unknown';
  if (pct >= COVERAGE_GOOD) return 'good';
  if (pct >= COVERAGE_PARTIAL) return 'partial';
  return 'low';
}

function median(xs) {
  const s = xs.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function npsFromScores(scores) {
  const xs = scores.filter((s) => s != null);
  if (!xs.length) return null;
  let p = 0;
  let d = 0;
  for (const s of xs) {
    const c = classifyNpsScore(s);
    if (c === 'Promotor') p++;
    else if (c === 'Detrator') d++;
  }
  return (p / xs.length) * 100 - (d / xs.length) * 100;
}

function resultadosNegativeClients(responseTopics, responses, cycleCode) {
  const byResp = new Map(responses.filter((r) => r.analytical_cycle_code === cycleCode).map((r) => [r.response_id, r]));
  const clients = new Set();
  for (const t of responseTopics) {
    if (t.analytical_cycle_code !== cycleCode || t.topic !== 'Resultados' || t.valence !== 'Negativa') continue;
    const r = byResp.get(t.response_id);
    if (r?.client_id) clients.add(r.client_id);
  }
  return clients;
}

/** @param {Map<string, object>} finByClient */
function previewCrosses(finByClient, negClients, milestonesByClient, cycleCode) {
  const all = [...finByClient.keys()];
  const rest = all.filter((id) => !negClients.has(id));
  const num = (ids, field) => ids.map((id) => Number(finByClient.get(id)?.[field])).filter((v) => !Number.isNaN(v));

  const reserva = mannWhitneyU(num([...negClients], 'reserva_liquidez'), num(rest, 'reserva_liquidez'));
  const aporte = mannWhitneyU(num([...negClients], 'ultimo_aporte'), num(rest, 'ultimo_aporte'));

  const anyDebt = (id) => {
    const f = finByClient.get(id);
    if (!f) return null;
    return Boolean(f.cheque_especial || f.parcelamento_cartao || f.credito_pessoal || f.credito_consignado);
  };

  let tierPreview = null;
  const withFin = all.filter((id) => finByClient.get(id)?.reserva_liquidez != null);
  const covPct = all.length ? (withFin.length / all.length) * 100 : null;

  return {
    central_question: {
      question: 'Clientes que reclamam de Resultados têm menor reserva ou menor capacidade de aporte?',
      n_resultados_negative_clients: negClients.size,
      n_with_financial_row: withFin.length,
      coverage_pct: covPct,
      coverage_quality: qualityLabel(covPct),
      reserva_liquidez: {
        median_negative: median(num([...negClients], 'reserva_liquidez')),
        median_others: median(num(rest, 'reserva_liquidez')),
        mann_whitney: reserva,
      },
      ultimo_aporte: {
        median_negative: median(num([...negClients], 'ultimo_aporte')),
        median_others: median(num(rest, 'ultimo_aporte')),
        mann_whitney: aporte,
      },
      note: 'Valores em client_financial_data — ver temporal_quality (majoritariamente current_proxy).',
    },
    prepared_not_published: {
      nps_by_tier: tierPreview,
      resultados_x_tier: { available: false, reason: 'no_official_tier_source' },
      resultados_x_reserva: reserva,
      resultados_x_aporte: aporte,
      resultados_x_debt_flag: {
        n_neg_with_flag: [...negClients].filter((id) => anyDebt(id) === true).length,
        n_neg_total: negClients.size,
      },
    },
  };
}

async function main() {
  const responses = await readJson('processed/responses.json', []);
  const responseTopics = await readJson('processed/response_topics.json', []);
  const milestones = await readJson('processed/nps_client_milestones.json', null);
  const latest = await readJson('snapshots/latest.json', null);
  const snapshotId = latest?.raw_snapshot ?? null;
  const financialPath = snapshotId ? `raw/${snapshotId}/client_financial_data.json` : null;
  const financialRows = financialPath ? await readJson(financialPath, []) : [];

  const setCycle = 'NPS-2026-SET-PHARUS';
  const setResponses = responses.filter(
    (r) => r.program?.toUpperCase() === 'PHARUS' && r.analytical_cycle_code === setCycle,
  );
  const pharusResponses = responses.filter((r) => r.program?.toUpperCase() === 'PHARUS');
  const setClients = new Set(setResponses.map((r) => r.client_id));
  const pharusClients = new Set(pharusResponses.map((r) => r.client_id));

  const negClients = resultadosNegativeClients(responseTopics, responses, setCycle);

  /** Métricas revalidadas via BASE QV (MCP) em 2026-09-29 — embutidas até export rotineiro existir. */
  const baseQvRevalidation = {
    audited_at: new Date().toISOString(),
    client_financial_data: {
      rows: 3109,
      distinct_clients: 3109,
      min_created_at: '2026-03-08T04:09:44.658Z',
      max_updated_at: '2026-09-29T14:01:31.489Z',
      join_key: 'client_id',
      coverage_set_respondents: { with_row: 243, total_clients: 253, pct: (243 / 253) * 100 },
      coverage_pharus_nps_clients: { with_row: 418, total_clients: 431, pct: (418 / 431) * 100 },
      coverage_note:
        'Diagnóstico antigo (poucas linhas) não vale — tabela hoje ~1 linha/cliente PHARUS ativo. Snapshot raw atual NÃO inclui export desta tabela.',
    },
    client_strategic_data: { rows: 52, distinct_clients: 52, coverage_quality: 'low' },
    clients_segmentacao: { all_pharus_null: true, note: 'segmentacao 100% NULL em PHARUS — não usar como Tier.' },
    contratos_pharus: {
      rows: 213,
      financial_fields: ['renda_mensal', 'valor_reserva', 'aporte_mensal'],
      join: 'cpf ↔ clients.cpf_digits (não client_id)',
      signed_cpf_match_pharus_nps_clients: 29,
      coverage_quality: 'low',
      temporal: 'form_submitted_at / signed_at — onboarding, não série temporal pós-entrada',
    },
    recepcao_leads: {
      fields: ['renda_mensal', 'reserva_liquidez', 'aporte_mensal'],
      note: 'Funil comercial — não alinhado 1:1 a respondentes NPS ativos.',
    },
  };

  let finByClient = new Map();
  if (Array.isArray(financialRows) && financialRows.length) {
    for (const row of financialRows) finByClient.set(row.client_id, row);
  }

  const crosses = finByClient.size
    ? previewCrosses(finByClient, negClients, milestones, setCycle)
    : {
        central_question: {
          question: 'Clientes que reclamam de Resultados têm menor reserva ou menor capacidade de aporte?',
          note: 'Export client_financial_data.json ausente no snapshot — usar números MCP em baseQvRevalidation + preview SQL abaixo.',
          sql_preview_set: {
            n_clients: 256,
            with_financial: 243,
            median_reserva_cohort: 150000,
            median_aporte_cohort: 5000,
          },
          resultados_negative_clients_voc: negClients.size,
          preview_artifact: 'quality/nps_financial_resultados_preview.json',
        },
        prepared_not_published: { pending_export: true },
      };

  const doc = {
    meta: {
      etapa: '4.6',
      program: 'PHARUS',
      generated_at: new Date().toISOString(),
      raw_snapshot: snapshotId,
      methodology_note: 'Auditoria de fontes — sem derivar Tier; sem publicar no dashboard.',
    },
    populations: {
      set_2026_responses: setResponses.length,
      set_2026_distinct_clients: setClients.size,
      pharus_responses_total: pharusResponses.length,
      pharus_distinct_clients: pharusClients.size,
    },
    sources_found: [
      {
        table: 'client_financial_data',
        role: 'primary',
        fields: {
          renda: 'ultima_renda_mensal (numeric, BRL implícito)',
          aporte: 'ultimo_aporte (numeric — último valor registrado, não distingue mensal/eventual no schema)',
          reserva: 'reserva_liquidez (numeric)',
          patrimonio_parcial: 'valor_imoveis_quitados',
          debitos_flags: ['cheque_especial', 'parcelamento_cartao', 'credito_pessoal', 'credito_consignado'],
          capacidade_aporte: 'não há coluna dedicada — proxy: ultimo_aporte / ultima_renda_mensal (não oficial)',
        },
        timestamps: ['created_at', 'updated_at'],
        temporal_quality: 'current_proxy',
        temporal_detail:
          'Sem histórico versionado. Set/2026: 203/243 linhas com updated_at <= submitted_at; 40 atualizadas após a resposta (ainda <30d). Ciclos anteriores = proxy atual.',
      },
      {
        table: 'client_strategic_data',
        role: 'qualitativo',
        fields: ['meta_renda_passiva', 'swot_*', 'objetivos financeiros (texto)'],
        temporal_quality: 'current_proxy',
        coverage_quality: 'low',
      },
      {
        table: 'contratos_pharus',
        role: 'onboarding_snapshot',
        fields: ['renda_mensal', 'valor_reserva', 'aporte_mensal'],
        temporal_quality: 'partial',
        coverage_quality: 'low',
      },
      {
        table: 'clients.segmentacao',
        role: 'not_tier',
        status: 'unavailable',
        note: 'Coluna existe mas NULL para todos PHARUS — não documentação Tier T1–T4.',
      },
      {
        table: 'recepcao_leads',
        role: 'commercial_intake',
        coverage_quality: 'low',
      },
    ],
    tier: {
      official_classification_found: false,
      do_not_recompute: true,
      candidates_rejected: ['clients.segmentacao', 'kv_store', 'form_questions (sem perguntas Tier)'],
      recommendation: 'Obter documentação/regra oficial Tier (provável fora do BASE QV ou view não exposta) antes de qualquer NPS×Tier.',
    },
    reserva: {
      field: 'client_financial_data.reserva_liquidez',
      unit: 'numeric (BRL, sem moeda no schema)',
      nulls_global: 3109 - 2891,
      zeros_global: 261,
      null_vs_zero: 'NULL = sem linha ou campo não preenchido; 0 = valor explícito — não tratar zero como NULL.',
      invalid: 'Outliers até ~200M; valores simbólicos 0.01 / 1 possíveis',
      coverage_set_pct: baseQvRevalidation.client_financial_data.coverage_set_respondents.pct,
      coverage_quality: qualityLabel(baseQvRevalidation.client_financial_data.coverage_set_respondents.pct),
    },
    aporte: {
      field: 'client_financial_data.ultimo_aporte',
      unit: 'numeric (BRL)',
      semantics: 'Último aporte registrado no cadastro — não há flag mensal vs eventual',
      reference_date: 'updated_at da linha (proxy)',
      coverage_set_pct: baseQvRevalidation.client_financial_data.coverage_set_respondents.pct,
      negative_values_global: 25,
    },
    debitos: {
      possui_divida: 'OR dos quatro booleanos em client_financial_data',
      valor_divida: 'unavailable — não há montante, só flags',
      set_cohort_any_debt_yes: 26,
      set_cohort_n_with_financial: 243,
      coverage_quality: qualityLabel((243 / 253) * 100),
    },
    temporal_quality_summary: {
      client_financial_data: 'current_proxy',
      client_strategic_data: 'current_proxy',
      contratos_pharus: 'partial',
      tier: 'unavailable',
    },
    base_qv_revalidation: baseQvRevalidation,
    crosses_preview: crosses,
    valid_crosses: [
      'Resultados (VoC) × reserva_liquidez — cobertura boa, com flag current_proxy',
      'Resultados × ultimo_aporte — idem',
      'Resultados × flags débito — cobertura boa; sem valor de dívida',
      'NPS × faixas de reserva/aporte (exploratório Set) — após export + flag temporal',
    ],
    invalid_or_deferred: [
      'NPS por Tier — sem fonte oficial',
      'Resultados × Tier',
      'Valor de dívida × NPS',
      'Mecanismos × reserva × Resultados (triplo) — só após export alinhado e n por célula',
      'Ciclos Jun–Jul históricos com financial current_proxy sem recorte updated_at',
    ],
    ui_recommendation: [
      'Não exibir Tier até fonte + documentação aprovadas.',
      'Bloco financeiro opcional em Drivers: reserva/aporte/dívida (sim/não) com badge current_proxy e % cobertura.',
      'Incluir client_financial_data no export de snapshot (SELECT service_role) e pipeline point-in-time opcional (updated_at <= submitted_at).',
      'Tratar zero reserva como dado explícito; NULL como missing.',
    ],
    limitations: [
      'Snapshot analytics-nps 2026-09-28 não contém client_financial_data — auditoria cruzada VoC usou BASE QV live.',
      'ultimo_aporte não é capacidade oficial de investimento.',
      '40 respondentes Set têm financial atualizado após a nota — interpretar com cautela.',
    ],
  };

  await writeJson('quality/nps_financial_sources_audit.json', doc);
  console.log('Auditoria financeira: data/quality/nps_financial_sources_audit.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
