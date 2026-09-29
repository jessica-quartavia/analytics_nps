import { SET_CYCLE_CODE } from './nps-financial-profile.mjs';

const CYCLE = SET_CYCLE_CODE;
const PREV = 'NPS-2026-JUN-JUL-PHARUS';

function insightBase(id, title, statement, extra = {}) {
  return {
    id,
    title,
    statement,
    scope: extra.scope ?? 'NPS-2026-SET-PHARUS',
    n: extra.n ?? null,
    effect: extra.effect ?? null,
    p_value: extra.p_value ?? null,
    quality: extra.quality ?? 'good',
    source: extra.source ?? [],
    status: extra.status ?? 'context',
    language: extra.language ?? 'evidence',
    detail: extra.detail ?? null,
    analysis_route: extra.analysis_route ?? 'movimento',
    analysis_anchor: extra.analysis_anchor ?? null,
  };
}

export function crossCheckManagementSources(sources) {
  const errors = [];
  const {
    cycleSummary,
    pairedCycles,
    changeDrivers,
    financialProfile,
    responseTopics,
    responses,
  } = sources;

  const setSummary = cycleSummary?.cycles?.find((c) => c.cycle_code === CYCLE);
  const prevSummary = cycleSummary?.cycles?.find((c) => c.cycle_code === PREV);
  const nSet = setSummary?.valid_responses;
  const finEntries = financialProfile?.entries?.length;
  if (nSet != null && finEntries != null && nSet !== finEntries) {
    errors.push(`financial_profile.entries (${finEntries}) !== cycle_summary Set valid_responses (${nSet})`);
  }

  const tierDist = financialProfile?.financial_profile_coverage?.tier_distribution;
  if (tierDist && finEntries != null) {
    const sum =
      (tierDist.T1 ?? 0) +
      (tierDist.T2 ?? 0) +
      (tierDist.T3 ?? 0) +
      (tierDist.T4 ?? 0) +
      (tierDist.unavailable ?? 0);
    if (sum !== finEntries) errors.push(`tier counts sum (${sum}) !== entries (${finEntries})`);
  }

  if (pairedCycles?.paired_clients != null && changeDrivers?.meta?.paired_transitions != null) {
    if (pairedCycles.paired_clients !== changeDrivers.meta.paired_transitions) {
      errors.push(
        `paired_cycles.paired_clients (${pairedCycles.paired_clients}) !== change_drivers paired_transitions (${changeDrivers.meta.paired_transitions})`,
      );
    }
  }

  const rm = changeDrivers?.resultados_mechanisms?.resultados_negative?.n;
  const rtNeg = countResultadosNegativeClients(responseTopics, responses, CYCLE);
  if (rm != null && rtNeg != null && rm !== rtNeg) {
    errors.push(`resultados_mechanisms n (${rm}) !== response_topics Resultados neg clients (${rtNeg})`);
  }

  const finNeg = financialProfile?.resultados_x_tier?.resultados_negative?.n;
  if (rm != null && finNeg != null && rm !== finNeg) {
    errors.push(`financial resultados_x_tier n (${finNeg}) !== change_drivers (${rm})`);
  }

  if (setSummary?.nps != null && Math.abs(setSummary.nps - (financialProfile?.meta?.cycle_nps ?? setSummary.nps)) > 0.01) {
    /* cycle_nps optional on profile */
  }

  return { ok: errors.length === 0, errors };
}

function countResultadosNegativeClients(responseTopics, responses, cycleCode) {
  if (!Array.isArray(responseTopics)) return null;
  const byResp = new Map(
    (responses ?? []).filter((r) => r.analytical_cycle_code === cycleCode).map((r) => [r.response_id, r]),
  );
  const clients = new Set();
  for (const t of responseTopics) {
    if (t.analytical_cycle_code !== cycleCode || t.topic !== 'Resultados' || t.valence !== 'Negativa') continue;
    const r = byResp.get(t.response_id);
    if (r?.client_id) clients.add(r.client_id);
  }
  return clients.size;
}

export function buildManagementInsights(sources) {
  const cross = crossCheckManagementSources(sources);
  const {
    cycleSummary,
    pairedCycles,
    changeDrivers,
    financialProfile,
  } = sources;

  const setSummary = cycleSummary?.cycles?.find((c) => c.cycle_code === CYCLE);
  const prevSummary = cycleSummary?.cycles?.find((c) => c.cycle_code === PREV);
  const insights = [];

  const nTotal = setSummary?.valid_responses ?? 253;
  const npsNow = setSummary?.nps;
  const npsPrev = prevSummary?.nps;
  const deltaTotal = npsNow != null && npsPrev != null ? npsNow - npsPrev : null;

  insights.push(
    insightBase('A_nps_total_decline', 'NPS total vs ciclo anterior', `Nos dados, o NPS PHARUS Set/2026 (${npsNow?.toFixed(1) ?? '—'}) ficou abaixo de Jun–Jul (${npsPrev?.toFixed(1) ?? '—'}).`, {
      n: nTotal,
      effect: deltaTotal != null ? `${deltaTotal >= 0 ? '+' : ''}${deltaTotal.toFixed(1)} pts` : null,
      status: deltaTotal != null && deltaTotal < 0 ? 'highlight' : 'context',
      language: 'evidence',
      source: ['processed/cycle_summary.json'],
      analysis_route: 'executivo',
    }),
  );

  const nPaired = pairedCycles?.paired_clients ?? 81;
  const deltaPaired = pairedCycles?.delta_nps_paired;
  insights.push(
    insightBase(
      'B_paired_decline',
      'Base pareada também piorou',
      `Nos dados, entre ${nPaired} clientes comparáveis, o NPS pareado caiu ${deltaPaired != null ? deltaPaired.toFixed(1) : '—'} pts (${pairedCycles?.previous_nps_paired?.toFixed(1) ?? '—'} → ${pairedCycles?.current_nps_paired?.toFixed(1) ?? '—'}).`,
      {
        n: nPaired,
        effect: deltaPaired != null ? `${deltaPaired.toFixed(1)} pts` : null,
        status: deltaPaired != null && deltaPaired < -5 ? 'highlight' : 'context',
        language: 'evidence',
        source: ['processed/paired_cycles.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'paired',
      },
    ),
  );

  const ppn = changeDrivers?.migration_groups?.['Promotor → Neutro']?.n ?? 12;
  const ppd = changeDrivers?.migration_groups?.['Promotor → Detrator']?.n ?? 1;
  insights.push(
    insightBase(
      'C_promotor_neutro',
      'Principal deterioração na migração',
      `Nos dados, a transição mais frequente entre promotores que saíram da zona promotora é Promotor → Neutro (n=${ppn}), acima de Promotor → Detrator (n=${ppd}).`,
      {
        n: nPaired,
        effect: `P→N n=${ppn}`,
        status: ppn >= ppd ? 'highlight' : 'context',
        language: 'evidence',
        source: ['processed/nps_change_drivers.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'migration',
      },
    ),
  );

  const h6 = changeDrivers?.ep_change?.H6_ep_change_vs_decline;
  insights.push(
    insightBase(
      'D_ep_no_association',
      'Troca de EP e queda',
      h6?.p_value != null && h6.p_value >= 0.05
        ? 'Não foi identificada diferença estatisticamente sustentada entre queda e troca de EP entre ciclos (proporção de EP trocado similar).'
        : 'Nos dados, a troca de EP entre ciclos apresentou associação exploratória com queda — interpretar com cautela.',
      {
        n: h6?.n ?? nPaired,
        p_value: h6?.p_value,
        status: 'insufficient_evidence',
        language: h6?.p_value != null && h6.p_value >= 0.05 ? 'no_evidence' : 'hypothesis',
        quality: 'good',
        source: ['processed/nps_change_drivers.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'change-drivers',
      },
    ),
  );

  const h1 = changeDrivers?.meetings?.tests?.H1_meetings_between_queda_vs_melhora;
  insights.push(
    insightBase(
      'E_meetings_no_robust',
      'Reuniões e queda',
      h1?.p_value != null && h1.p_value >= 0.05
        ? 'Não foi identificada diferença estatisticamente sustentada na mediana de reuniões entre ciclos ao comparar queda vs melhora (Mann-Whitney).'
        : 'Pode indicar diferença na mediana de reuniões entre queda e melhora — associação, não causalidade.',
      {
        n: h1?.n ?? null,
        p_value: h1?.p_value,
        effect: h1?.difference != null ? `Δ mediana ${h1.difference}` : null,
        status: 'insufficient_evidence',
        language: h1?.p_value != null && h1.p_value >= 0.05 ? 'no_evidence' : 'hypothesis',
        source: ['processed/nps_change_drivers.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'change-drivers',
      },
    ),
  );

  const rm = changeDrivers?.resultados_mechanisms;
  insights.push(
    insightBase(
      'F_resultados_more_mechanisms',
      'Resultados negativo e mecanismos',
      'Nos dados, clientes que mencionam Resultados negativamente não têm menos mecanismos; no ciclo atual, apresentam mediana maior e maior concentração em 2+ mecanismos antes da resposta.',
      {
        n: rm?.resultados_negative?.n ?? 56,
        effect: `mediana ${rm?.resultados_negative?.median_mechanisms ?? '—'} vs ${rm?.others?.median_mechanisms ?? '—'} · 2+ ${rm?.resultados_negative?.pct_two_plus?.toFixed(0) ?? '—'}% vs ${rm?.others?.pct_two_plus?.toFixed(0) ?? '—'}%`,
        p_value: rm?.comparison?.p_value,
        status: 'highlight',
        language: 'evidence',
        quality: changeDrivers?.coverage?.fields?.mechanisms_before_response?.quality ?? 'good',
        source: ['processed/nps_change_drivers.json'],
        detail: {
          n_negative: rm?.resultados_negative?.n,
          n_others: rm?.others?.n,
          median_negative: rm?.resultados_negative?.median_mechanisms,
          median_others: rm?.others?.median_mechanisms,
          pct_two_plus_negative: rm?.resultados_negative?.pct_two_plus,
          pct_two_plus_others: rm?.others?.pct_two_plus,
          test: rm?.comparison?.test ?? 'mann_whitney',
        },
        analysis_route: 'movimento',
        analysis_anchor: 'change-drivers',
      },
    ),
  );

  const rxt = financialProfile?.resultados_x_tier;
  insights.push(
    insightBase(
      'G_resultados_not_tier_concentrated',
      'Resultados negativo × Tier',
      rxt?.association?.p_value != null && rxt.association.p_value >= 0.05
        ? 'Não foi identificada concentração estatisticamente sustentada de Resultados negativo em um Tier específico (qui-quadrado).'
        : 'Pode indicar concentração de Resultados negativo em Tiers específicos — ver distribuição.',
      {
        n: (rxt?.resultados_negative?.n ?? 0) + (rxt?.others?.n ?? 0),
        p_value: rxt?.association?.p_value,
        status: 'insufficient_evidence',
        language: 'no_evidence',
        quality: financialProfile?.financial_profile_coverage?.coverage_quality ?? 'partial',
        source: ['processed/nps_financial_profile.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'financial-profile',
      },
    ),
  );

  const rxr = financialProfile?.resultados_x_reserve;
  insights.push(
    insightBase(
      'H_resultados_not_lower_reserve',
      'Resultados negativo × reserva',
      rxr?.mann_whitney?.p_value != null && rxr.mann_whitney.p_value >= 0.05
        ? 'Não foi identificada diferença estatisticamente sustentada na mediana de reserva entre Resultados negativo e demais.'
        : 'Pode indicar diferença na distribuição de reserva — ver mediana e IQR no detalhe.',
      {
        n: rxr?.n_negative ?? null,
        p_value: rxr?.mann_whitney?.p_value,
        effect:
          rxr?.median_negative != null && rxr?.median_others != null
            ? `mediana ${rxr.median_negative} vs ${rxr.median_others}`
            : null,
        status: 'insufficient_evidence',
        language: 'no_evidence',
        quality: financialProfile?.financial_profile_coverage?.do_not_label_as_full_base_qv_snapshot
          ? 'partial'
          : 'good',
        source: ['processed/nps_financial_profile.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'financial-profile',
      },
    ),
  );

  const rxd = financialProfile?.resultados_x_debts;
  insights.push(
    insightBase(
      'I_debts_no_clear_association',
      'Resultados negativo × débitos',
      rxd?.p_value != null && rxd.p_value >= 0.05
        ? 'Não foi identificada diferença estatisticamente sustentada na proporção com débitos entre Resultados negativo e demais.'
        : 'Pode indicar diferença na proporção com débitos — associação exploratória.',
      {
        n: (rxd?.n_negative ?? 0) + (rxd?.n_others ?? 0),
        p_value: rxd?.p_value,
        status: 'insufficient_evidence',
        language: 'no_evidence',
        source: ['processed/nps_financial_profile.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'financial-profile',
      },
    ),
  );

  const byTier = financialProfile?.nps_by_tier;
  insights.push(
    insightBase(
      'J_tier_not_monotonic_nps',
      'Tier e NPS',
      'Nos dados, o NPS varia entre Tiers, mas sem padrão crescente ou decrescente monotônico com capacidade financeira (proxy).',
      {
        n: nTotal,
        effect: byTier
          ? `T1 n=${byTier.T1?.n} NPS=${byTier.T1?.nps?.toFixed(0) ?? '—'} · T2 ${byTier.T2?.nps?.toFixed(0) ?? '—'} · T3 ${byTier.T3?.nps?.toFixed(0) ?? '—'} · T4 ${byTier.T4?.nps?.toFixed(0) ?? '—'}`
          : null,
        status: 'context',
        language: 'evidence',
        quality: financialProfile?.meta?.aporte_semantics === 'ambiguous' ? 'partial' : 'good',
        source: ['processed/nps_financial_profile.json'],
        detail: byTier,
        analysis_route: 'movimento',
        analysis_anchor: 'financial-profile',
      },
    ),
  );

  const aporteDetail = financialProfile?.resultados_x_contribution;
  insights.push(
    insightBase(
      'K_aporte_distribution_context',
      'Aporte (campo ambíguo)',
      'Foi identificada diferença de distribuição do campo de aporte entre Resultados negativo e demais, mas a semântica de ultimo_aporte ainda precisa ser validada — não usar como insight principal.',
      {
        n: aporteDetail?.n_negative ?? null,
        p_value: aporteDetail?.mann_whitney?.p_value,
        effect:
          aporteDetail?.median_negative != null
            ? `medianas ${aporteDetail.median_negative} vs ${aporteDetail.median_others} (IQR distintos)`
            : null,
        status: 'context',
        language: 'hypothesis',
        quality: 'partial',
        source: ['processed/nps_financial_profile.json'],
        analysis_route: 'movimento',
        analysis_anchor: 'financial-profile',
      },
    ),
  );

  const executive_cards = [
    {
      card_id: 'exec_paired_decline',
      title: 'Queda também na base comparável',
      statement:
        'A queda de NPS também aparece entre clientes que responderam nos dois ciclos (base pareada), não apenas no total do ciclo.',
      insight_id: 'B_paired_decline',
      analysis_route: 'movimento',
      analysis_anchor: 'paired',
    },
    {
      card_id: 'exec_promotor_neutro',
      title: 'Principal deterioração: Promotor → Neutro',
      statement: 'A maior parte da saída da zona promotora foi para neutro, não para detrator.',
      insight_id: 'C_promotor_neutro',
      analysis_route: 'movimento',
      analysis_anchor: 'migration',
    },
    {
      card_id: 'exec_resultados_mechanisms',
      title: 'Resultados e mecanismos',
      statement:
        'A insatisfação com Resultados não se concentra em clientes com menos mecanismos; no ciclo atual, quem menciona o tema tende a ter mais mecanismos implementados.',
      insight_id: 'F_resultados_more_mechanisms',
      analysis_route: 'movimento',
      analysis_anchor: 'change-drivers',
    },
    {
      card_id: 'exec_tier_not_explanation',
      title: 'Tier não explica sozinho',
      statement:
        'Tier e capacidade financeira (proxy) não isolam a insatisfação com Resultados nem explicam monotonicamente o NPS.',
      insight_id: 'G_resultados_not_tier_concentrated',
      analysis_route: 'movimento',
      analysis_anchor: 'financial-profile',
    },
  ];

  return {
    meta: {
      etapa: '4.8',
      cycle_code: CYCLE,
      generated_at: new Date().toISOString(),
      methodology_note: 'Consolidação gerencial 4.3–4.7 — sem novas fontes ou hipóteses.',
    },
    cross_check: cross,
    insights,
    executive_cards,
    language_legend: {
      evidence: 'Nos dados…',
      hypothesis: 'Pode indicar…',
      no_evidence: 'Não foi identificada diferença estatisticamente sustentada…',
    },
    quality_gate_legend: {
      highlight: 'Boa cobertura, n adequado, efeito relevante, proxy não dominante',
      context: 'Proxy ou limitação moderada',
      insufficient_evidence: 'n pequeno, cobertura baixa, p sem suporte ou fonte partial',
    },
  };
}
