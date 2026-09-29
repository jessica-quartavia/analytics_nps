import {
  STABLE_NPS_THRESHOLD,
  MIN_EP_DIAGNOSIS_SAMPLE,
  MIN_DRIVER_N,
  SMALL_PAIRED_THRESHOLD,
  LOW_RESPONSE_RATE_THRESHOLD,
  HIGH_EP_PROXY_THRESHOLD,
  MIN_TOPIC_SHARE_PCT,
  EP_NPS_DECLINE_THRESHOLD,
  HIGH_DETRACTOR_SHARE_PCT,
  LOW_EP_CONFIDENCE_PCT,
  MAX_EXECUTIVE_DRIVERS,
  MIN_COMMENT_DRIVER_N,
  DRIVER_QUALITY_WEIGHT,
} from './executive-diagnosis-config.mjs';
import { classifyTopicEvolution, buildEvolutionBuckets } from './topic-evolution.mjs';
import { mergeActionTracking } from './action-tracking.mjs';
import { DEFAULT_ACTION_STATUS } from './action-config.mjs';

const PENDING_STATUSES = new Set(['Novo', 'Em análise', 'Contatado', 'Em acompanhamento']);
const COMPLETED_STATUSES = new Set(['Resolvido', 'Sem ação imediata']);

const NEGATIVE_MIGRATION_KEYS = new Set([
  'Promotor -> Neutro',
  'Promotor -> Detrator',
  'Neutro -> Detrator',
]);
const POSITIVE_MIGRATION_KEYS = new Set([
  'Detrator -> Promotor',
  'Detrator -> Neutro',
  'Neutro -> Promotor',
]);

function fmtNum1(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function npsDirection(delta) {
  if (delta == null) return null;
  if (Math.abs(delta) < STABLE_NPS_THRESHOLD) return 'stable';
  return delta > 0 ? 'improved' : 'worsened';
}

function findCycleSummary(cycleSummaryDoc, cycleCode) {
  return (cycleSummaryDoc?.cycles ?? []).find((c) => c.cycle_code === cycleCode) ?? null;
}

function findPreviousCycleCode(cycles, cycleCode) {
  const sorted = [...(cycles ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const idx = sorted.findIndex((c) => c.cycle_code === cycleCode);
  if (idx <= 0) return null;
  return sorted[idx - 1].cycle_code;
}

function normalizeMigrationKey(key) {
  return (key ?? '').replace(' → ', ' -> ').replace('→', '->');
}

function buildHeadline(currentSummary, previousSummary, cycleName) {
  const current_nps = currentSummary?.nps ?? null;
  const previous_nps = previousSummary?.nps ?? null;
  const delta_nps =
    current_nps != null && previous_nps != null ? current_nps - previous_nps : null;
  const direction = npsDirection(delta_nps);
  let text = null;
  if (delta_nps != null && cycleName) {
    const d = fmtNum1(Math.abs(delta_nps));
    if (direction === 'worsened') text = `NPS caiu ${d} pontos em ${cycleName}.`;
    else if (direction === 'improved') text = `NPS subiu ${d} pontos em ${cycleName}.`;
    else text = `NPS permaneceu estável em ${cycleName}.`;
  }
  return {
    text,
    current_nps,
    previous_nps,
    delta_nps,
    direction,
    source_artifacts: ['cycle_summary.json'],
  };
}

function buildOverall(currentSummary, previousSummary) {
  const delta =
    currentSummary?.nps != null && previousSummary?.nps != null
      ? currentSummary.nps - previousSummary.nps
      : null;
  return {
    current_nps: currentSummary?.nps ?? null,
    previous_nps: previousSummary?.nps ?? null,
    delta_nps: delta,
    valid_responses: currentSummary?.valid_responses ?? null,
    eligible_clients: currentSummary?.eligible_clients ?? null,
    response_rate: currentSummary?.response_rate ?? null,
    response_rate_quality: currentSummary?.response_rate_quality ?? null,
    ci95: {
      low: currentSummary?.nps_ci_low ?? null,
      high: currentSummary?.nps_ci_high ?? null,
      method: currentSummary?.nps_ci_method ?? null,
    },
    promoters: currentSummary?.promoters ?? null,
    passives: currentSummary?.passives ?? null,
    detractors: currentSummary?.detractors ?? null,
    promoter_pct: currentSummary?.promoter_pct ?? null,
    passive_pct: currentSummary?.passive_pct ?? null,
    detractor_pct: currentSummary?.detractor_pct ?? null,
    source_artifacts: ['cycle_summary.json'],
  };
}

function buildPaired(pairedDoc, currentSummary, previousSummary, headline) {
  if (!pairedDoc || pairedDoc.current_cycle !== currentSummary?.cycle_code) {
    return { available: false, source_artifacts: ['paired_cycles.json'] };
  }
  const totalDir = headline?.direction;
  const pairedDelta = pairedDoc.delta_nps_paired;
  const pairedDir = npsDirection(pairedDelta);
  let comparison_text = null;
  if (totalDir && pairedDir) {
    if (totalDir === pairedDir || (totalDir === 'stable' && pairedDir === 'stable')) {
      comparison_text = 'Movimento também aparece entre os mesmos clientes.';
    } else {
      comparison_text = 'A base total e a base pareada apresentam movimentos diferentes.';
    }
  }
  return {
    available: true,
    paired_clients: pairedDoc.paired_clients ?? 0,
    previous_nps_paired: pairedDoc.previous_nps_paired ?? null,
    current_nps_paired: pairedDoc.current_nps_paired ?? null,
    delta_nps_paired: pairedDoc.delta_nps_paired ?? null,
    previous_average_score: pairedDoc.previous_average_score ?? null,
    current_average_score: pairedDoc.current_average_score ?? null,
    average_score_delta: pairedDoc.average_score_delta ?? null,
    comparison_text,
    direction_total: totalDir,
    direction_paired: pairedDir,
    source_artifacts: ['paired_cycles.json', 'cycle_summary.json'],
  };
}

function buildMovement(migrationMatrixDoc, pairedClients) {
  if (!migrationMatrixDoc?.cells?.length) {
    return { available: false, source_artifacts: ['migration_matrix.json'] };
  }
  const cells = migrationMatrixDoc.cells.map((c) => ({
    ...c,
    key: normalizeMigrationKey(c.key),
    label: normalizeMigrationKey(c.key).replace(' -> ', ' → '),
  }));
  let improved_clients = 0;
  let worsened_clients = 0;
  let stable_clients = 0;
  let positive_migrations = 0;
  let negative_migrations = 0;

  for (const cell of cells) {
    const [from, to] = cell.key.split(' -> ').map((s) => s.trim());
    if (from === to) {
      stable_clients += cell.count;
      continue;
    }
    if (POSITIVE_MIGRATION_KEYS.has(cell.key)) {
      improved_clients += cell.count;
      positive_migrations += cell.count;
    }
    if (NEGATIVE_MIGRATION_KEYS.has(cell.key)) {
      worsened_clients += cell.count;
      negative_migrations += cell.count;
    }
  }

  const top_movements = [...cells]
    .filter((c) => {
      if (c.count <= 0) return false;
      const [from, to] = c.key.split(' -> ').map((s) => s.trim());
      return from !== to;
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((c) => ({
      migration: c.label,
      count: c.count,
      pct_of_origin: c.pct_of_origin,
    }));

  const topNegative = cells
    .filter((c) => NEGATIVE_MIGRATION_KEYS.has(c.key) && c.count > 0)
    .sort((a, b) => b.count - a.count)[0];

  let reading = null;
  const n = pairedClients ?? migrationMatrixDoc.paired_clients ?? 0;
  if (n > 0 && worsened_clients > 0) {
    reading = `Entre ${n} clientes pareados, ${worsened_clients} migraram para uma categoria inferior.`;
  }
  if (topNegative) {
    const migText = `A principal migração negativa foi ${topNegative.label.replace(' -> ', ' → ')}, com ${topNegative.count} clientes.`;
    reading = reading ? `${reading} ${migText}` : migText;
  }

  return {
    available: true,
    improved_clients,
    stable_clients,
    worsened_clients,
    positive_migrations,
    negative_migrations,
    top_movements,
    reading,
    source_artifacts: ['migration_matrix.json'],
  };
}

function buildEpsSection(epSummaryDoc, cycleCode) {
  const entries = (epSummaryDoc?.entries ?? []).filter((e) => e.cycle_code === cycleCode);
  const eps_attention = [];

  for (const ep of entries) {
    const n = ep.valid_responses ?? 0;
    const reason_codes = [];
    if (n < MIN_EP_DIAGNOSIS_SAMPLE) reason_codes.push('small_sample');
    if ((ep.ep_low_confidence_pct ?? 0) >= LOW_EP_CONFIDENCE_PCT) reason_codes.push('low_ep_confidence');
    if (ep.delta_nps_paired != null && ep.delta_nps_paired <= -EP_NPS_DECLINE_THRESHOLD) {
      reason_codes.push('nps_decline');
    }
    if (
      ep.deteriorated_promoters_denominator > 0 &&
      ep.deteriorated_promoters / ep.deteriorated_promoters_denominator >= 0.2
    ) {
      reason_codes.push('promoter_deterioration');
    }
    if ((ep.detractor_pct ?? 0) >= HIGH_DETRACTOR_SHARE_PCT) {
      reason_codes.push('high_detractor_share');
    }
    if (!reason_codes.length) continue;

    const highlight = reason_codes.some((c) => c !== 'small_sample' && c !== 'low_ep_confidence');
    if (!highlight && n < MIN_EP_DIAGNOSIS_SAMPLE) {
      continue;
    }

    eps_attention.push({
      ep_name: ep.ep_name,
      n,
      current_nps: ep.nps,
      delta_nps_paired: ep.delta_nps_paired,
      paired_clients: ep.paired_clients,
      response_rate: ep.response_rate,
      sample_warning: n < MIN_EP_DIAGNOSIS_SAMPLE,
      low_confidence_pct: ep.ep_low_confidence_pct,
      reason_codes,
      source_artifacts: ['ep_summary.json'],
    });
  }

  eps_attention.sort((a, b) => {
    const da = a.delta_nps_paired ?? 0;
    const db = b.delta_nps_paired ?? 0;
    return da - db;
  });

  const small_sample_eps = entries.filter((e) => (e.valid_responses ?? 0) < MIN_EP_DIAGNOSIS_SAMPLE).length;

  return {
    available: entries.length > 0,
    eps_attention: eps_attention.slice(0, 8),
    small_sample_count: small_sample_eps,
    min_sample: MIN_EP_DIAGNOSIS_SAMPLE,
    source_artifacts: ['ep_summary.json'],
  };
}

function buildVocSection(topicSummaryDoc, cycleCode, previousCycleCode) {
  if (!topicSummaryDoc?.entries?.length) {
    return { available: false, message: 'VoC ainda não disponível.', source_artifacts: ['topic_summary.json'] };
  }
  const current = topicSummaryDoc.entries.filter((e) => e.analytical_cycle_code === cycleCode);
  const previous = previousCycleCode
    ? topicSummaryDoc.entries.filter((e) => e.analytical_cycle_code === previousCycleCode)
    : [];
  const prevByTopic = new Map(previous.map((e) => [e.topic, e]));

  const withShare = current.filter((t) => (t.pct_responses ?? 0) >= MIN_TOPIC_SHARE_PCT);
  const top_topics = [...withShare].sort((a, b) => b.pct_responses - a.pct_responses).slice(0, 5);
  const top_negative_topics = [...withShare]
    .sort((a, b) => (b.negative_pct ?? 0) - (a.negative_pct ?? 0))
    .slice(0, 5);
  const top_positive_topics = [...withShare]
    .sort((a, b) => (b.positive_pct ?? 0) - (a.positive_pct ?? 0))
    .slice(0, 5);

  const evolutionEntries = [];
  for (const row of current) {
    const signal = classifyTopicEvolution(row, prevByTopic.get(row.topic) ?? null);
    if (signal) evolutionEntries.push({ topic: row.topic, signal, pct_responses: row.pct_responses });
  }

  const buckets = buildEvolutionBuckets(topicSummaryDoc.entries, cycleCode);
  const executive_lines = [];
  const topNeg = top_negative_topics[0];
  if (topNeg) {
    executive_lines.push(
      `${topNeg.topic} apareceu em ${fmtNum1(topNeg.pct_responses)}% dos comentários classificados e concentrou ${fmtNum1(topNeg.negative_pct)}% de valência negativa entre menções ao tema.`,
    );
  }
  const emerging = evolutionEntries.find((e) => e.signal === 'pain_emerging');
  if (emerging) {
    executive_lines.push(
      `${emerging.topic} aumentou participação (${fmtNum1(emerging.pct_responses)}% das respostas com comentário classificado).`,
    );
  }

  return {
    available: true,
    top_topics: top_topics.map((t) => ({
      topic: t.topic,
      responses_with_topic: t.responses_with_topic,
      pct_responses: t.pct_responses,
    })),
    top_negative_topics: top_negative_topics.map((t) => ({
      topic: t.topic,
      negative_pct: t.negative_pct,
      pct_responses: t.pct_responses,
    })),
    top_positive_topics: top_positive_topics.map((t) => ({
      topic: t.topic,
      positive_pct: t.positive_pct,
      pct_responses: t.pct_responses,
    })),
    emerging_pains: buckets.pain_emerging ?? [],
    recurring_pains: buckets.recurring_pain ?? [],
    improving_topics: buckets.improving ?? [],
    positive_emerging: buckets.positive_emerging ?? [],
    executive_lines,
    classification: topicSummaryDoc.classification ?? null,
    source_artifacts: ['topic_summary.json'],
  };
}

function driverRankScore(entry) {
  const q = DRIVER_QUALITY_WEIGHT[entry.feature_quality] ?? 0;
  return (Math.abs(entry.effect_size ?? 0) || 0) * q * Math.sqrt(entry.n ?? 0);
}

function buildDriversSection(driversSummaryDoc, cycleCode) {
  if (!driversSummaryDoc?.entries?.length) {
    return {
      available: false,
      message: 'Drivers ainda não disponíveis.',
      executive_drivers: [],
      source_artifacts: ['drivers_summary.json'],
    };
  }
  const pool = driversSummaryDoc.entries.filter(
    (e) =>
      e.cycle_code === cycleCode &&
      e.significant_fdr_05 &&
      (e.n ?? 0) >= MIN_DRIVER_N &&
      e.universe === 'cycle',
  );
  const executive_drivers = [...pool]
    .sort((a, b) => driverRankScore(b) - driverRankScore(a))
    .slice(0, MAX_EXECUTIVE_DRIVERS)
    .map((e) => ({
      driver: e.driver,
      outcome: e.outcome,
      method: e.method,
      effect_size: e.effect_size,
      effect_label: e.effect_label,
      n: e.n,
      p_value_adjusted: e.p_value_adjusted,
      feature_quality: e.feature_quality,
      text: e.reading_hint ?? `${e.driver} apresentou associação estatística (${e.method}) com ${e.outcome} na amostra analisada.`,
      source_artifacts: ['drivers_summary.json', 'driver_tests.json'],
    }));

  return {
    available: executive_drivers.length > 0,
    executive_drivers,
    tests_count: driversSummaryDoc.tests_count ?? null,
    significant_fdr_count: driversSummaryDoc.significant_fdr_count ?? null,
    average_feature_coverage: driversSummaryDoc.average_feature_coverage ?? null,
    message: executive_drivers.length ? null : 'Nenhuma associação passou critérios executivos (FDR, n mínimo).',
    source_artifacts: ['drivers_summary.json'],
  };
}

function buildCommentDriversSection(commentDriversDoc, cycleCode) {
  if (!commentDriversDoc?.length) {
    return { available: false, source_artifacts: ['comment_drivers.json'] };
  }
  const rows = commentDriversDoc.filter(
    (r) =>
      r.analytical_cycle_code === cycleCode &&
      (r.responses_with_topic ?? 0) >= MIN_COMMENT_DRIVER_N &&
      r.significant_fdr_05 === true,
  );
  const byAbsDelta = (a, b) => Math.abs(b.delta_nps ?? 0) - Math.abs(a.delta_nps ?? 0);
  const associated_negative = rows
    .filter((r) => (r.delta_nps ?? 0) < 0)
    .sort(byAbsDelta)
    .slice(0, 5);
  const associated_positive = rows
    .filter((r) => (r.delta_nps ?? 0) > 0)
    .sort(byAbsDelta)
    .slice(0, 5);
  return {
    available: associated_negative.length > 0 || associated_positive.length > 0,
    associated_negative,
    associated_positive,
    source_artifacts: ['comment_drivers.json'],
  };
}

function buildCsatSection(csatSummaryDoc, cycleCode, previousCycleCode) {
  const cycles = (csatSummaryDoc?.cycles ?? []).filter((c) => c.analytical_cycle_code);
  const current = cycles.find((c) => c.analytical_cycle_code === cycleCode);
  const previous = previousCycleCode
    ? cycles.find((c) => c.analytical_cycle_code === previousCycleCode)
    : null;
  if (!current) {
    return { available: false, source_artifacts: ['csat_summary.json'] };
  }
  const out = {
    available: true,
    current_average: current.average_score,
    current_satisfied_pct: current.satisfied_pct,
    valid_responses: current.valid_responses,
    aggregation_note: current.aggregation,
    previous_average: previous?.average_score ?? null,
    previous_satisfied_pct: previous?.satisfied_pct ?? null,
    delta_average: null,
    delta_satisfied_pct: null,
    comparable: Boolean(previous),
    source_artifacts: ['csat_summary.json'],
  };
  if (previous) {
    out.delta_average = current.average_score - previous.average_score;
    out.delta_satisfied_pct = current.satisfied_pct - previous.satisfied_pct;
  }
  return out;
}

function buildActionsSection(actionQueueEnrichedDoc, actionTrackingDoc) {
  if (!actionQueueEnrichedDoc?.entries?.length) {
    return { available: false, source_artifacts: ['action_queue_enriched.json'] };
  }
  const rows = mergeActionTracking(actionQueueEnrichedDoc.entries, actionTrackingDoc ?? { entries: [] });
  const counts = { Alta: 0, Média: 0, Investigar: 0, Aprendizado: 0 };
  let pending = 0;
  let in_progress = 0;
  let completed = 0;
  for (const r of rows) {
    counts[r.priority] = (counts[r.priority] ?? 0) + 1;
    const st = r.status ?? DEFAULT_ACTION_STATUS;
    if (st === 'Novo') pending += 1;
    else if (st === 'Em análise' || st === 'Contatado' || st === 'Em acompanhamento') in_progress += 1;
    else if (COMPLETED_STATUSES.has(st)) completed += 1;
  }
  const priority_follow_up = (counts.Alta ?? 0) + (counts.Média ?? 0);
  return {
    available: true,
    high_priority: counts.Alta,
    medium_priority: counts.Média,
    investigate: counts.Investigar,
    learning: counts.Aprendizado,
    pending,
    in_progress,
    completed,
    priority_follow_up,
    top_action_reasons: [
      { label: 'Alta prioridade', count: counts.Alta },
      { label: 'Média prioridade', count: counts.Média },
      { label: 'Investigar', count: counts.Investigar },
      { label: 'Aprendizado', count: counts.Aprendizado },
    ],
    executive_line: `${priority_follow_up} clientes demandam acompanhamento prioritário (Alta + Média).`,
    source_artifacts: ['action_queue_enriched.json', 'operational/action_tracking.json'],
  };
}

function buildQualityBlock(ctx) {
  const {
    currentSummary,
    topicSummaryDoc,
    csatLegacy,
    pairedDoc,
    driversSection,
    responses,
    cycleCode,
    qualityDoc,
  } = ctx;
  const cycleResponses = (responses ?? []).filter((r) => r.analytical_cycle_code === cycleCode);
  const lowProxy = cycleResponses.filter((r) => r.ep_resolution_confidence === 'low').length;
  const ep_current_proxy_pct = cycleResponses.length ? lowProxy / cycleResponses.length : 0;

  const flags = [];
  if (currentSummary?.status === 'open' || currentSummary?.response_rate_quality === 'partial') {
    flags.push('partial_cycle');
  }
  if (
    currentSummary?.response_rate != null &&
    currentSummary.response_rate < LOW_RESPONSE_RATE_THRESHOLD
  ) {
    flags.push('low_response_rate');
  }
  if ((pairedDoc?.paired_clients ?? 0) < SMALL_PAIRED_THRESHOLD) {
    flags.push('small_paired_base');
  }
  if (ep_current_proxy_pct >= HIGH_EP_PROXY_THRESHOLD) {
    flags.push('high_ep_proxy');
  }
  if ((topicSummaryDoc?.classification?.pct_reviewed ?? 0) < 1) {
    flags.push('voc_unreviewed');
  }
  if (csatLegacy?.csat_rule_ambiguous) {
    flags.push('csat_rule_ambiguous');
  }
  const avgCov = driversSection?.average_feature_coverage ?? 1;
  if (avgCov < 0.5) {
    flags.push('driver_proxy_heavy');
  }

  const warnings_count = (qualityDoc?.entries ?? []).filter(
    (e) => e.severity === 'warning' || e.severity === 'critical',
  ).length;

  return {
    data_quality_status: warnings_count > 0 ? 'attention' : 'ok',
    warnings_count,
    ep_current_proxy_count: lowProxy,
    ep_current_proxy_pct,
    voc_classification_coverage: topicSummaryDoc?.classification?.pct_coverage ?? null,
    voc_reviewed_pct: topicSummaryDoc?.classification?.pct_reviewed ?? null,
    voc_average_confidence: topicSummaryDoc?.classification?.confidence_mean ?? null,
    csat_rule_ambiguous: Boolean(csatLegacy?.csat_rule_ambiguous),
    paired_sample_size: pairedDoc?.paired_clients ?? null,
    driver_features_coverage: avgCov,
    flags,
    source_artifacts: ['quality/data_quality.json', 'responses.json', 'topic_summary.json'],
  };
}

function buildManagementQuestions(parts, cycleName) {
  const h = parts.headline;
  const p = parts.paired;
  const m = parts.movement;
  const eps = parts.eps;
  const voc = parts.voc;
  const dr = parts.drivers;
  const act = parts.actions;

  return [
    {
      id: 'nps_direction',
      question: 'O NPS melhorou ou piorou?',
      answer:
        h.direction === 'worsened'
          ? `O NPS ${cycleName ? `em ${cycleName} ` : ''}recuou ${fmtNum1(Math.abs(h.delta_nps))} pontos frente ao ciclo anterior.`
          : h.direction === 'improved'
            ? `O NPS avançou ${fmtNum1(h.delta_nps)} pontos frente ao ciclo anterior.`
            : 'O NPS permaneceu estável dentro do limiar definido.',
      supporting_metrics: { current_nps: h.current_nps, previous_nps: h.previous_nps, delta_nps: h.delta_nps },
      source_artifacts: ['cycle_summary.json'],
    },
    {
      id: 'paired_confirmation',
      question: 'O mesmo movimento aparece entre os mesmos clientes?',
      answer: p.comparison_text ?? 'Base pareada indisponível para este ciclo.',
      supporting_metrics: {
        delta_nps_paired: p.delta_nps_paired,
        paired_clients: p.paired_clients,
      },
      source_artifacts: ['paired_cycles.json'],
    },
    {
      id: 'who_changed',
      question: 'Quem mudou?',
      answer:
        m.reading ??
        (m.worsened_clients != null
          ? `${m.worsened_clients} clientes migraram para categoria inferior; ${m.improved_clients} migraram para categoria superior (base pareada).`
          : 'Matriz de migração indisponível.'),
      supporting_metrics: {
        worsened_clients: m.worsened_clients,
        improved_clients: m.improved_clients,
        stable_clients: m.stable_clients,
      },
      source_artifacts: ['migration_matrix.json'],
    },
    {
      id: 'ep_attention',
      question: 'Quais carteiras merecem atenção?',
      answer:
        eps.eps_attention?.length
          ? `Identificadas ${eps.eps_attention.length} carteiras com sinais de atenção (queda pareada, amostra ou confiança EP).`
          : 'Nenhuma carteira atende critérios de destaque executivo neste ciclo.',
      supporting_metrics: { eps_attention: eps.eps_attention?.map((e) => e.ep_name) },
      source_artifacts: ['ep_summary.json'],
    },
    {
      id: 'voc_negative',
      question: 'Quais temas aparecem com maior frequência negativa?',
      answer:
        voc.executive_lines?.[0] ??
        (voc.top_negative_topics?.[0]
          ? `${voc.top_negative_topics[0].topic} concentra maior proporção de valência negativa.`
          : 'VoC indisponível ou abaixo do limiar de participação.'),
      supporting_metrics: { top_negative_topics: voc.top_negative_topics },
      source_artifacts: ['topic_summary.json'],
    },
    {
      id: 'drivers_investigate',
      question: 'Quais associações merecem investigação?',
      answer:
        dr.executive_drivers?.length
          ? `${dr.executive_drivers.length} associações estatísticas (FDR) selecionadas para leitura executiva — interpretar como hipóteses, não causas.`
          : dr.message ?? 'Drivers não disponíveis.',
      supporting_metrics: { drivers: dr.executive_drivers?.map((d) => d.driver) },
      source_artifacts: ['drivers_summary.json'],
    },
    {
      id: 'action_count',
      question: 'Quantos clientes precisam de ação?',
      answer: act.executive_line ?? 'Fila de ação indisponível.',
      supporting_metrics: {
        priority_follow_up: act.priority_follow_up,
        pending: act.pending,
      },
      source_artifacts: ['action_queue_enriched.json'],
    },
  ];
}

function buildExecutiveSummary(parts, cycleName) {
  const bullets = [];
  const h = parts.headline;
  if (h.current_nps != null && h.delta_nps != null && cycleName) {
    const verb = h.direction === 'worsened' ? 'queda' : h.direction === 'improved' ? 'alta' : 'variação';
    if (h.direction === 'stable') {
      bullets.push(`NPS de ${cycleName} foi ${fmtNum1(h.current_nps)}, estável frente ao ciclo anterior.`);
    } else {
      bullets.push(
        `NPS de ${cycleName} foi ${fmtNum1(h.current_nps)}, ${verb} de ${fmtNum1(Math.abs(h.delta_nps))} pontos frente ao ciclo anterior.`,
      );
    }
  }
  const p = parts.paired;
  if (p.available && p.paired_clients && p.delta_nps_paired != null) {
    bullets.push(
      `Entre os ${p.paired_clients} clientes presentes nos dois ciclos, o NPS ${p.delta_nps_paired < 0 ? 'caiu' : p.delta_nps_paired > 0 ? 'subiu' : 'permaneceu em'} ${fmtNum1(Math.abs(p.delta_nps_paired))} pontos.`,
    );
  }
  if (parts.movement.reading) bullets.push(parts.movement.reading);
  if (parts.actions.priority_follow_up != null) {
    bullets.push(
      `${parts.actions.priority_follow_up} clientes estão em prioridade Alta ou Média para acompanhamento.`,
    );
  }
  const vocLine = parts.voc.executive_lines?.[0];
  if (vocLine) bullets.push(vocLine.replace(/\.$/, '') + '.');
  const csat = parts.csat;
  if (csat.available && csat.current_average != null) {
    if (csat.comparable && csat.delta_average != null) {
      bullets.push(
        `CSAT médio ${csat.delta_average >= 0 ? 'subiu' : 'caiu'} ${fmtNum1(Math.abs(csat.delta_average))} na escala 0–5 (${fmtNum1(csat.current_average)} atual).`,
      );
    } else {
      bullets.push(`CSAT médio do ciclo: ${fmtNum1(csat.current_average)}/5 (todas as respostas válidas).`);
    }
  }
  if (parts.drivers.executive_drivers?.length) {
    bullets.push(
      'Associações estatísticas aparecem em variáveis operacionais e temas — não devem ser interpretadas causalmente.',
    );
  }
  if (parts.eps.eps_attention?.length) {
    bullets.push(
      `${parts.eps.eps_attention.length} carteiras EP com sinais de atenção (amostra ou movimento pareado).`,
    );
  }

  return bullets.slice(0, 8).map((text) => ({
    text,
    source_artifacts: ['executive_diagnosis.json'],
  }));
}

/**
 * @param {object} input
 * @returns {object}
 */
export function buildExecutiveDiagnosis(input) {
  const {
    cycleCode,
    cycles = [],
    cycleSummaryDoc,
    pairedCyclesDoc,
    migrationMatrixDoc,
    epSummaryDoc,
    topicSummaryDoc,
    driversSummaryDoc,
    commentDriversDoc,
    csatSummaryDoc,
    actionQueueEnrichedDoc,
    actionTrackingDoc,
    csatLegacyReconciliation,
    qualityDoc,
    responses = [],
    dataCutoff,
    generatedAt = new Date().toISOString(),
  } = input;

  const currentSummary = findCycleSummary(cycleSummaryDoc, cycleCode);
  const previousCycleCode = findPreviousCycleCode(cycles, cycleCode);
  const previousSummary = previousCycleCode
    ? findCycleSummary(cycleSummaryDoc, previousCycleCode)
    : null;
  const cycleMeta = cycles.find((c) => c.cycle_code === cycleCode);
  const cycleName = cycleMeta?.cycle_name ?? currentSummary?.cycle_name ?? cycleCode;

  const headline = buildHeadline(currentSummary, previousSummary, cycleName);
  const overall = buildOverall(currentSummary, previousSummary);
  const paired =
    pairedCyclesDoc?.current_cycle === cycleCode
      ? buildPaired(pairedCyclesDoc, currentSummary, previousSummary, headline)
      : { available: false, source_artifacts: ['paired_cycles.json'] };
  const movement =
    migrationMatrixDoc?.current_cycle === cycleCode
      ? buildMovement(migrationMatrixDoc, paired.paired_clients)
      : { available: false, source_artifacts: ['migration_matrix.json'] };
  const eps = buildEpsSection(epSummaryDoc, cycleCode);
  const voc = buildVocSection(topicSummaryDoc, cycleCode, previousCycleCode);
  const drivers = buildDriversSection(driversSummaryDoc, cycleCode);
  const comment_drivers = buildCommentDriversSection(commentDriversDoc, cycleCode);
  const csat = buildCsatSection(csatSummaryDoc, cycleCode, previousCycleCode);
  const actions = buildActionsSection(actionQueueEnrichedDoc, actionTrackingDoc);
  const quality = buildQualityBlock({
    currentSummary,
    topicSummaryDoc,
    csatLegacy: csatLegacyReconciliation,
    pairedDoc: pairedCyclesDoc?.current_cycle === cycleCode ? pairedCyclesDoc : null,
    driversSection: drivers,
    responses,
    cycleCode,
    qualityDoc,
  });

  const parts = { headline, paired, movement, eps, voc, drivers, csat, actions };
  const management_questions = buildManagementQuestions(parts, cycleName);
  const executive_summary = buildExecutiveSummary({ ...parts, eps, comment_drivers }, cycleName);

  return {
    cycle_code: cycleCode,
    cycle_name: cycleName,
    generated_at: generatedAt,
    data_cutoff: dataCutoff ?? cycleSummaryDoc?.data_cutoff ?? null,
    status: currentSummary?.status ?? cycleMeta?.status ?? null,
    previous_cycle_code: previousCycleCode,

    headline,
    overall,
    paired,
    movement,
    eps,
    voc,
    drivers: { ...drivers, comment_drivers },
    csat,
    actions,
    quality,

    executive_summary,
    management_questions,
    methodology_notes: [
      'Diagnóstico determinístico gerado no pipeline analítico — sem LLM.',
      `NPS estável quando |Δ| < ${STABLE_NPS_THRESHOLD} ponto.`,
      'Associações em drivers descrevem relações na amostra, não causalidade individual.',
      'CSAT agrega todas as respostas válidas por ciclo, sem dedupe por cliente.',
      `Destaques EP exigem n ≥ ${MIN_EP_DIAGNOSIS_SAMPLE} salvo bloco de qualidade.`,
    ],
  };
}
