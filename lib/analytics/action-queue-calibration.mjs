import { PRIORITY_RANK, PRIORITY_ORDER } from './action-config.mjs';
import { computeInvestigateReasons } from './action-priority.mjs';

/** Identificadores estáveis para regras (auditoria). */
export const INVESTIGATE_RULE_IDS = {
  CSAT_DETRACTOR: 'csat_favorable_nps_detractor',
  CSAT_DROP: 'csat_high_nps_drop',
  NEG_TOPICS_PROMOTOR: 'negative_topics_among_promoters',
  LARGE_DELTA_NO_CONTEXT: 'large_delta_no_comment_or_topics',
  LARGE_DELTA_NO_CONTEXT_PROPOSED: 'large_negative_delta_no_comment_or_topics',
  DETRACTOR_IMPROVING: 'detractor_with_improvement_evolution',
};

const RULE_TEXT_TO_ID = {
  'CSAT recente favorável com NPS Detrator (sinal contraditório)': INVESTIGATE_RULE_IDS.CSAT_DETRACTOR,
  'Queda de NPS com CSAT médio elevado (sinal contraditório)': INVESTIGATE_RULE_IDS.CSAT_DROP,
  'Comentário com múltiplos temas negativos entre Promotores': INVESTIGATE_RULE_IDS.NEG_TOPICS_PROMOTOR,
  'Mudança relevante de nota sem comentário ou temas classificados':
    INVESTIGATE_RULE_IDS.LARGE_DELTA_NO_CONTEXT,
  'Categoria Detrator com evolução classificada como melhora': INVESTIGATE_RULE_IDS.DETRACTOR_IMPROVING,
};

export const CURRENT_INVESTIGATE_RULES_DOC = {
  version: '2026-09-28',
  rules: [
    {
      id: INVESTIGATE_RULE_IDS.CSAT_DETRACTOR,
      description: 'CSAT recente ≥4 com NPS Detrator',
    },
    {
      id: INVESTIGATE_RULE_IDS.CSAT_DROP,
      description: 'CSAT médio ≥4, delta NPS ≤−2, categoria ≠ Detrator',
    },
    {
      id: INVESTIGATE_RULE_IDS.NEG_TOPICS_PROMOTOR,
      description: '≥2 temas negativos entre Promotores',
    },
    {
      id: INVESTIGATE_RULE_IDS.LARGE_DELTA_NO_CONTEXT,
      description: '|Δ| ≥ 4 pareado, sem comentário e sem temas (ATUAL — simétrico)',
      note: 'Grande melhora também dispara; ver proposta direcional.',
    },
    {
      id: INVESTIGATE_RULE_IDS.DETRACTOR_IMPROVING,
      description: 'Detrator com evolution_status Melhora/Grande melhora',
    },
  ],
};

export const PROPOSED_INVESTIGATE_RULES_DOC = {
  version: '2026-09-28-proposed',
  changes: [
    {
      id: INVESTIGATE_RULE_IDS.LARGE_DELTA_NO_CONTEXT,
      replace_with: INVESTIGATE_RULE_IDS.LARGE_DELTA_NO_CONTEXT_PROPOSED,
      description: 'Δ ≤ −4 (somente queda), pareado, sem comentário/temas',
      rationale: 'Melhorias fortes não são risco operacional; Aprendizado cobre evolução positiva.',
    },
  ],
  unchanged: [
    INVESTIGATE_RULE_IDS.CSAT_DETRACTOR,
    INVESTIGATE_RULE_IDS.CSAT_DROP,
    INVESTIGATE_RULE_IDS.NEG_TOPICS_PROMOTOR,
    INVESTIGATE_RULE_IDS.DETRACTOR_IMPROVING,
  ],
};

/**
 * Versão proposta — queda direcional, sem |Δ|.
 */
export function computeInvestigateReasonsProposed(row, ctx = {}) {
  const reasons = [];
  const category = row.nps_category;
  const delta = row.score_delta ?? null;
  const hasCsat = ctx.has_csat === true;
  const latestCsat = ctx.latest_csat_score;
  const csatAvg = ctx.csat_average;
  const negTopics = ctx.negative_topics_count ?? 0;
  const topicsCount = ctx.topics_count ?? 0;
  const comment = (row.comment ?? ctx.comment ?? '').trim();

  if (hasCsat && latestCsat != null && latestCsat >= 4 && category === 'Detrator') {
    reasons.push('CSAT recente favorável com NPS Detrator (sinal contraditório)');
  }
  if (
    hasCsat &&
    csatAvg != null &&
    csatAvg >= 4 &&
    delta != null &&
    delta <= -2 &&
    category !== 'Detrator'
  ) {
    reasons.push('Queda de NPS com CSAT médio elevado (sinal contraditório)');
  }
  if (negTopics >= 2 && category === 'Promotor') {
    reasons.push('Comentário com múltiplos temas negativos entre Promotores');
  }
  if (
    delta != null &&
    delta <= -4 &&
    !comment &&
    topicsCount === 0 &&
    row.is_paired_with_previous
  ) {
    reasons.push('Queda relevante de nota sem comentário ou temas classificados');
  }
  if (
    category === 'Detrator' &&
    (row.evolution_status === 'Melhora' || row.evolution_status === 'Grande melhora')
  ) {
    reasons.push('Categoria Detrator com evolução classificada como melhora');
  }
  return reasons;
}

export function computeActionPriorityProposed(row, ctx = {}) {
  const reasons = [];
  let priority = null;
  const migration = row.nps_migration || '';
  const evolution = row.evolution_status || '';
  const category = row.nps_category;
  const prevCat = row.previous_category;

  const add = (p, reason) => {
    if (!priority || PRIORITY_RANK[p] > PRIORITY_RANK[priority]) {
      priority = p;
    }
    reasons.push(reason);
  };

  if (migration === 'Promotor → Detrator') add('Alta', 'Promotor → Detrator');
  if (evolution === 'Queda severa') add('Alta', 'Queda severa');
  if (row.consecutive_detractor) add('Alta', 'Detrator recorrente (ciclos consecutivos)');
  if (row.critical_flag) add('Alta', 'Sinal crítico de experiência');

  if (migration === 'Promotor → Neutro') add('Média', 'Promotor → Neutro');
  if (migration === 'Neutro → Detrator') add('Média', 'Neutro → Detrator');
  if (evolution === 'Queda' && prevCat === category && category !== 'Detrator') {
    add('Média', 'Queda relevante sem mudança de categoria');
  }

  if (migration === 'Detrator → Promotor') add('Aprendizado', 'Detrator → Promotor');
  if (evolution === 'Grande melhora') add('Aprendizado', 'Grande melhora');
  if (row.promotor_consistent) add('Aprendizado', 'Promotor consistente em múltiplos ciclos');

  for (const inv of computeInvestigateReasonsProposed(row, ctx)) {
    add('Investigar', inv);
  }

  if (!priority) return { priority: null, reasons: [] };
  return { priority, reasons };
}

function median(nums) {
  const a = nums.filter((n) => n != null && !Number.isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function countBy(arr, keyFn) {
  const m = {};
  for (const x of arr) {
    const k = keyFn(x) ?? '—';
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
}

function entryToPriorityRow(entry) {
  const promotorFromRules = (entry.priority_rules ?? []).some((r) =>
    r.includes('Promotor consistente'),
  );
  return {
    nps_migration: entry.nps_migration,
    evolution_status: entry.evolution_status,
    nps_category: entry.current_category,
    previous_category: entry.previous_category,
    score_delta: entry.score_delta,
    consecutive_detractor: entry.consecutive_detractor ?? false,
    promotor_consistent: entry.promotor_consistent ?? promotorFromRules,
    critical_flag: entry.critical_flag ?? false,
    comment: entry.comment,
    is_paired_with_previous: entry.previous_score != null,
  };
}

function entryToCtx(entry) {
  return {
    has_csat: entry.has_csat ?? false,
    latest_csat_score: entry.latest_csat_score,
    csat_average: entry.csat_average,
    negative_topics_count: (entry.negative_topics ?? []).length,
    topics_count: (entry.topics ?? []).length,
    comment: entry.comment,
  };
}

function ruleIdFromText(text) {
  return RULE_TEXT_TO_ID[text] ?? text;
}

function buildRuleStats(investigateEntries) {
  const byRule = new Map();
  for (const e of investigateEntries) {
    for (const ruleText of e.priority_rules ?? []) {
      const id = ruleIdFromText(ruleText);
      if (!byRule.has(id)) {
        byRule.set(id, {
          rule: ruleText,
          rule_id: id,
          count: 0,
          entries: [],
        });
      }
      const bucket = byRule.get(id);
      bucket.count += 1;
      bucket.entries.push(e);
    }
  }

  const nInv = investigateEntries.length || 1;
  const rules = [];
  for (const bucket of byRule.values()) {
    const deltas = bucket.entries.map((x) => x.score_delta);
    rules.push({
      rule: bucket.rule,
      rule_id: bucket.rule_id,
      count: bucket.count,
      pct_in_priority: (bucket.count / nInv) * 100,
      score_delta_median: median(deltas),
      score_delta_min: deltas.length ? Math.min(...deltas.filter((d) => d != null)) : null,
      score_delta_max: deltas.length ? Math.max(...deltas.filter((d) => d != null)) : null,
      previous_category_distribution: countBy(bucket.entries, (x) => x.previous_category),
      current_category_distribution: countBy(bucket.entries, (x) => x.current_category),
      comments_available: bucket.entries.filter((x) => (x.comment ?? '').trim()).length,
      topics_available: bucket.entries.filter((x) => (x.topics ?? []).length > 0).length,
      csat_available: bucket.entries.filter((x) => x.has_csat).length,
    });
  }
  rules.sort((a, b) => b.count - a.count);
  return rules;
}

function ruleCombinationStats(investigateEntries) {
  const combos = new Map();
  for (const e of investigateEntries) {
    const ids = [...new Set((e.priority_rules ?? []).map(ruleIdFromText))].sort();
    const key = ids.join(' + ') || '(sem regra)';
    combos.set(key, (combos.get(key) ?? 0) + 1);
  }
  return [...combos.entries()]
    .map(([combination, count]) => ({ combination, count }))
    .sort((a, b) => b.count - a.count);
}

function analyzeLargeDeltaRule(investigateEntries) {
  const ruleText = 'Mudança relevante de nota sem comentário ou temas classificados';
  const onlyRule = investigateEntries.filter(
    (e) =>
      e.priority === 'Investigar' &&
      (e.priority_rules ?? []).length === 1 &&
      e.priority_rules[0] === ruleText,
  );
  const withRule = investigateEntries.filter((e) => (e.priority_rules ?? []).includes(ruleText));

  const profile = (list) => ({
    n: list.length,
    improvements: list.filter((e) => (e.score_delta ?? 0) > 0).length,
    declines: list.filter((e) => (e.score_delta ?? 0) < 0).length,
    stable: list.filter((e) => (e.score_delta ?? 0) === 0).length,
    current_promotor: list.filter((e) => e.current_category === 'Promotor').length,
    current_detractor: list.filter((e) => e.current_category === 'Detrator').length,
    current_neutro: list.filter((e) => e.current_category === 'Neutro').length,
    high_current_score: list.filter((e) => (e.current_score ?? 0) >= 9).length,
    low_current_score: list.filter((e) => (e.current_score ?? 0) <= 6).length,
  });

  return {
    rule_text: ruleText,
    uses_abs_delta_threshold: 4,
    proposed_directional: 'score_delta <= -4',
    clients_with_rule: profile(withRule),
    clients_only_this_rule: profile(onlyRule),
  };
}

function transitionMatrix(entries, simulateFn) {
  const matrix = {};
  for (const from of [...PRIORITY_ORDER, 'fora_da_fila']) {
    matrix[from] = {};
    for (const to of [...PRIORITY_ORDER, 'fora_da_fila']) {
      matrix[from][to] = 0;
    }
  }
  for (const e of entries) {
    const from = e.priority ?? 'fora_da_fila';
    const proposed = simulateFn(e);
    const to = proposed ?? 'fora_da_fila';
    matrix[from][to] = (matrix[from][to] ?? 0) + 1;
  }
  return matrix;
}

function distribution(entries) {
  const counts = Object.fromEntries(PRIORITY_ORDER.map((p) => [p, 0]));
  let out = 0;
  for (const e of entries) {
    if (e.priority && counts[e.priority] != null) counts[e.priority] += 1;
    else out += 1;
  }
  return { ...counts, fora_da_fila: out, total_in_queue: entries.length };
}

function exampleCases(changes, limitPerRule = 5) {
  const byKey = new Map();
  for (const c of changes) {
    const key = c.change_reason ?? 'other';
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(c);
  }
  const out = [];
  for (const [key, list] of byKey) {
    out.push({
      change_reason: key,
      examples: list.slice(0, limitPerRule).map((c) => ({
        client_id: c.client_id,
        previous_score: c.previous_score,
        current_score: c.current_score,
        score_delta: c.score_delta,
        nps_migration: c.nps_migration,
        has_comment: Boolean((c.comment ?? '').trim()),
        has_topics: (c.topics ?? []).length > 0,
        current_priority: c.current_priority,
        proposed_priority: c.proposed_priority,
        reason: c.reason,
      })),
    });
  }
  return out;
}

/**
 * @param {object} params
 * @returns {object}
 */
export function buildActionQueueCalibration(params) {
  const {
    actionQueueEnrichedDoc,
    cycleCode,
    generatedAt = new Date().toISOString(),
  } = params;

  const allEntries = (actionQueueEnrichedDoc?.entries ?? []).filter(
    (e) => !cycleCode || e.cycle_code === cycleCode,
  );
  const investigateEntries = allEntries.filter((e) => e.priority === 'Investigar');

  const investigate_triggers = investigateEntries.map((e) => {
    const row = entryToPriorityRow(e);
    const ctx = entryToCtx(e);
    const triggers = computeInvestigateReasons(row, ctx);
    return { client_id: e.client_id, triggers };
  });

  const triggerOnlyStats = buildRuleStats(
    investigateEntries.map((e, i) => ({
      ...e,
      priority_rules: investigate_triggers[i].triggers,
    })),
  );

  const investigate_decomposition = investigateEntries.map((e) => ({
    client_id: e.client_id,
    client_name: e.client_name,
    priority_rules: e.priority_rules ?? [],
    reason: e.reason,
    nps_migration: e.nps_migration,
    score_delta: e.score_delta,
    previous_score: e.previous_score,
    current_score: e.current_score,
    previous_category: e.previous_category,
    current_category: e.current_category,
    has_comment: Boolean((e.comment ?? '').trim()),
    has_topics: (e.topics ?? []).length > 0,
    has_csat: Boolean(e.has_csat),
    negative_topics_count: (e.negative_topics ?? []).length,
  }));

  const rule_distribution = buildRuleStats(investigateEntries);
  const rule_combinations = ruleCombinationStats(investigateEntries);
  const large_delta_audit = analyzeLargeDeltaRule(investigateEntries);

  const current_distribution = distribution(allEntries);

  const changes = [];
  const proposedEntries = allEntries.map((e) => {
    const row = entryToPriorityRow(e);
    const ctx = entryToCtx(e);
    const current = e.priority;
    const { priority: proposed, reasons } = computeActionPriorityProposed(row, ctx);
    if (proposed !== current) {
      changes.push({
        client_id: e.client_id,
        current_priority: current,
        proposed_priority: proposed,
        change_reason:
          proposed == null
            ? 'sai_da_fila'
            : proposed !== current
              ? 'repriorizacao_proposta'
              : null,
        previous_score: e.previous_score,
        current_score: e.current_score,
        score_delta: e.score_delta,
        nps_migration: e.nps_migration,
        comment: (e.comment ?? '').slice(0, 120),
        topics: (e.topics ?? []).map((t) => t.topic),
        reason: reasons.join('; '),
      });
    }
    return { ...e, proposed_priority: proposed };
  });

  const proposedPriorities = proposedEntries.map((e) => e.proposed_priority);
  const proposedCounts = Object.fromEntries(PRIORITY_ORDER.map((p) => [p, 0]));
  let proposedOut = 0;
  for (const p of proposedPriorities) {
    if (p && proposedCounts[p] != null) proposedCounts[p] += 1;
    else proposedOut += 1;
  }
  const proposed_distribution = {
    ...proposedCounts,
    fora_da_fila: proposedOut,
    total_in_queue: allEntries.length - proposedOut,
  };

  const priority_transition_matrix = transitionMatrix(allEntries, (e) => {
    const { priority } = computeActionPriorityProposed(entryToPriorityRow(e), entryToCtx(e));
    return priority;
  });

  const investigate_only_large_delta = investigateEntries.filter((e) => {
    const rules = e.priority_rules ?? [];
    return (
      rules.length === 1 &&
      rules[0] === 'Mudança relevante de nota sem comentário ou temas classificados'
    );
  });

  return {
    generated_at: generatedAt,
    cycle_code: cycleCode ?? actionQueueEnrichedDoc?.meta?.cycle_code,
    summary: {
      queue_total: allEntries.length,
      investigate_count: investigateEntries.length,
      current_distribution,
      proposed_distribution,
      clients_changing_priority: changes.length,
      investigate_removed_by_proposal: investigateEntries.filter((e) => {
        const { priority } = computeActionPriorityProposed(entryToPriorityRow(e), entryToCtx(e));
        return priority !== 'Investigar' && e.priority === 'Investigar';
      }).length,
    },
    investigate_decomposition,
    rule_distribution,
    investigate_trigger_distribution: triggerOnlyStats,
    rule_combinations,
    large_delta_rule_audit: large_delta_audit,
    current_rules: CURRENT_INVESTIGATE_RULES_DOC,
    proposed_rules: PROPOSED_INVESTIGATE_RULES_DOC,
    priority_transition_matrix,
    calibration_examples: exampleCases(changes),
    notes: [
      'Simulação proposta — action_queue oficial inalterada até aprovação humana.',
      'Regra simétrica |Δ|≥4 gera Investigar em melhorias sem comentário; proposta restringe a Δ≤−4.',
      `Apenas regra grande delta: ${investigate_only_large_delta.length} clientes só por essa regra.`,
    ],
    recommendation_pending: true,
  };
}

export function buildCalibrationRecommendation(calibration) {
  const audit = calibration.large_delta_rule_audit;
  const only = audit.clients_only_this_rule;
  const removed = calibration.summary.investigate_removed_by_proposal;
  const inv = calibration.summary.investigate_count;
  const triggers = calibration.investigate_trigger_distribution ?? [];

  let recommendation = 'manter_regras_oficiais';
  let rationale = [];

  const negTopics = triggers.find((t) => t.rule_id === INVESTIGATE_RULE_IDS.NEG_TOPICS_PROMOTOR);
  const largeDelta = triggers.find(
    (t) => t.rule_id === INVESTIGATE_RULE_IDS.LARGE_DELTA_NO_CONTEXT,
  );

  if (negTopics && negTopics.count >= inv * 0.5) {
    recommendation = 'revisar_regra_temas_negativos_promotor';
    rationale.push(
      `${negTopics.count} de ${inv} Investigar (${negTopics.pct_in_priority.toFixed(1)}%) disparam pela regra "≥2 temas negativos entre Promotores" — mediana Δ=${negTopics.score_delta_median}; revisar limiar ou exigir queda de nota.`,
    );
  }

  if (only.n > 0 && only.improvements > only.declines) {
    recommendation = recommendation === 'manter_regras_oficiais' ? 'adotar_delta_direcional' : recommendation;
    rationale.push(
      `Regra |Δ|≥4: entre exclusivos, ${only.improvements} melhorias vs ${only.declines} quedas — adotar Δ≤−4 para risco.`,
    );
  } else if (largeDelta?.count) {
    rationale.push(`Regra |Δ|≥4 presente em ${largeDelta.count} casos Investigar.`);
  } else {
    rationale.push(
      'Regra |Δ|≥4 sem comentário não explica a fila atual (0 gatilhos Investigar) — problema está em outras regras.',
    );
  }

  if (removed > 0) {
    rationale.push(
      `Simulação direcional alteraria ${removed} prioridades (${calibration.summary.clients_changing_priority} mudanças totais).`,
    );
  }

  if (!rationale.length) {
    rationale.push('Distribuição coerente com regras; sem meta de tamanho de fila.');
  }

  return {
    recommendation,
    rationale,
    not_based_on_queue_size_target: true,
  };
}
