/**
 * Lógica pura do store (testável em Node). Não recalcula NPS — consome summaries processados.
 */

export function sortCyclesBySequence(cycles) {
  return [...(cycles ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export function getLatestCycleBySequence(cycles) {
  const sorted = sortCyclesBySequence(cycles);
  return sorted[sorted.length - 1] ?? null;
}

export function getPreviousCycleCode(cycles, currentCode) {
  const sorted = sortCyclesBySequence(cycles);
  const idx = sorted.findIndex((c) => c.cycle_code === currentCode);
  if (idx <= 0) return null;
  return sorted[idx - 1].cycle_code;
}

export function buildSummaryMap(cycleSummaryDoc) {
  const map = new Map();
  for (const s of cycleSummaryDoc?.cycles ?? []) {
    map.set(s.cycle_code, s);
  }
  return map;
}

export function getCycleSummaryFromMap(summaryMap, cycleCode) {
  return summaryMap.get(cycleCode) ?? null;
}

export function getResponsesForCycle(responses, cycleCode) {
  return (responses ?? []).filter((r) => r.analytical_cycle_code === cycleCode);
}

export function getPairedCyclesForCurrent(pairedDoc, currentCycleCode) {
  if (!pairedDoc || pairedDoc.current_cycle !== currentCycleCode) return pairedDoc;
  return pairedDoc;
}

export function getMigrationMatrixForCurrent(migrationDoc, currentCycleCode) {
  if (!migrationDoc || migrationDoc.current_cycle !== currentCycleCode) return null;
  return migrationDoc;
}

export function getActionQueueForCycle(actionQueue, cycleCode) {
  return (actionQueue ?? []).filter((a) => a.cycle_code === cycleCode);
}

export function summarizeQuality(qualityDoc) {
  const entries = qualityDoc?.entries ?? [];
  const byCheck = {};
  const bySeverity = { error: 0, warning: 0, info: 0 };
  for (const e of entries) {
    byCheck[e.check_name] = (byCheck[e.check_name] ?? 0) + 1;
    const sev = e.severity === 'critical' ? 'error' : e.severity ?? 'info';
    if (bySeverity[sev] != null) bySeverity[sev]++;
    else bySeverity.info++;
  }
  return { byCheck, bySeverity, total: entries.length };
}

export function countActionPriorities(queue) {
  const counts = { Alta: 0, Média: 0, Aprendizado: 0, Investigar: 0 };
  for (const item of queue ?? []) {
    const p = item.priority ?? 'Investigar';
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return counts;
}

/** Filtros aplicáveis sem recalcular NPS. */
export function filterResponses(rows, filters, options = {}) {
  const { pairedClientIds = null, previousResponseByClient = null } = options;
  let out = [...rows];

  if (filters.base === 'paired' && pairedClientIds) {
    out = out.filter((r) => pairedClientIds.has(r.client_id));
  }

  if (filters.ep) {
    out = out.filter((r) => r.ep_name === filters.ep);
  }

  if (filters.category) {
    out = out.filter((r) => r.nps_category === filters.category);
  }

  if (filters.scoreMin != null && filters.scoreMin !== '') {
    const min = Number(filters.scoreMin);
    out = out.filter((r) => r.score >= min);
  }

  if (filters.scoreMax != null && filters.scoreMax !== '') {
    const max = Number(filters.scoreMax);
    out = out.filter((r) => r.score <= max);
  }

  if (filters.deltaMin != null && filters.deltaMin !== '') {
    const min = Number(filters.deltaMin);
    out = out.filter((r) => r.score_delta != null && r.score_delta >= min);
  }

  if (filters.deltaMax != null && filters.deltaMax !== '') {
    const max = Number(filters.deltaMax);
    out = out.filter((r) => r.score_delta != null && r.score_delta <= max);
  }

  if (filters.migrationCell) {
    const normalized = filters.migrationCell.includes('→')
      ? filters.migrationCell
      : filters.migrationCell.replace(' -> ', ' → ');
    out = out.filter((r) => r.nps_migration === normalized);
  }

  if (filters.priority) {
    const clientSet = options.priorityClientIds;
    if (clientSet) out = out.filter((r) => clientSet.has(r.client_id));
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    out = out.filter(
      (r) =>
        (r.client_name && r.client_name.toLowerCase().includes(q)) ||
        (r.client_code && r.client_code.toLowerCase().includes(q)) ||
        (r.ep_name && r.ep_name.toLowerCase().includes(q)),
    );
  }

  if (filters.withPreviousOnly) {
    out = out.filter((r) => r.previous_score != null);
  }

  if (filters.hasCsat && options.clientSatById) {
    out = filterByHasCsat(out, options.clientSatById, filters.hasCsat);
  }

  return out;
}

export function buildClientSatMap(clientSatisfactionDoc) {
  const map = new Map();
  for (const e of clientSatisfactionDoc?.entries ?? []) {
    map.set(e.client_id, e);
  }
  return map;
}

export function filterByHasCsat(rows, clientSatById, hasCsatFilter) {
  if (!hasCsatFilter || hasCsatFilter === '') return rows;
  return rows.filter((r) => {
    const sat = clientSatById.get(r.client_id);
    const has = Boolean(sat?.has_csat);
    if (hasCsatFilter === 'yes') return has;
    if (hasCsatFilter === 'no') return !has;
    return true;
  });
}

export function getCsatSummaryForCycle(csatSummaryDoc, cycleCode) {
  return (csatSummaryDoc?.cycles ?? []).find((c) => c.analytical_cycle_code === cycleCode) ?? null;
}

export function movementKpis(rows) {
  const withPrev = rows.filter((r) => r.previous_score != null);
  let improved = 0;
  let stable = 0;
  let declined = 0;
  let severe = 0;
  for (const r of withPrev) {
    if (r.evolution_status === 'Grande melhora' || r.evolution_status === 'Melhora') improved++;
    else if (r.evolution_status === 'Estável') stable++;
    else if (r.evolution_status === 'Queda') declined++;
    else if (r.evolution_status === 'Queda severa') severe++;
  }
  return {
    paired: withPrev.length,
    improved,
    stable,
    declined,
    severe,
  };
}

export function evolutionDistribution(rows) {
  const withPrev = rows.filter((r) => r.previous_score != null);
  const dist = {
    'Grande melhora': 0,
    Melhora: 0,
    Estável: 0,
    Queda: 0,
    'Queda severa': 0,
  };
  for (const r of withPrev) {
    if (r.evolution_status && dist[r.evolution_status] != null) {
      dist[r.evolution_status]++;
    }
  }
  return { dist, total: withPrev.length };
}

export function topScoreChanges(rows, direction = 'up', limit = 10) {
  const withDelta = rows.filter((r) => r.score_delta != null);
  const sorted =
    direction === 'up'
      ? [...withDelta].sort((a, b) => b.score_delta - a.score_delta)
      : [...withDelta].sort((a, b) => a.score_delta - b.score_delta);
  return sorted.slice(0, limit);
}

export function buildExecutiveReading({ currentSummary, previousSummary, paired }) {
  const lines = [];
  if (currentSummary?.nps != null && previousSummary?.nps != null) {
    const d = currentSummary.nps - previousSummary.nps;
    if (d < 0) {
      lines.push(
        `O NPS recuou ${Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pontos em relação ao ciclo anterior.`,
      );
    } else if (d > 0) {
      lines.push(
        `O NPS avançou ${d.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pontos em relação ao ciclo anterior.`,
      );
    } else {
      lines.push('O NPS permaneceu estável em relação ao ciclo anterior.');
    }
  }

  if (paired?.delta_nps_paired != null && paired.delta_nps_paired < 0) {
    lines.push('A queda também aparece entre os mesmos clientes que responderam nos dois ciclos.');
  } else if (paired?.delta_nps_paired != null && paired.delta_nps_paired > 0) {
    lines.push('Entre os mesmos clientes, o NPS melhorou em relação ao ciclo anterior.');
  }

  if (
    previousSummary?.detractor_pct != null &&
    currentSummary?.detractor_pct != null &&
    currentSummary.detractor_pct > previousSummary.detractor_pct
  ) {
    lines.push(
      `A participação de detratores aumentou de ${previousSummary.detractor_pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% para ${currentSummary.detractor_pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.`,
    );
  }

  if (currentSummary?.response_rate_quality && currentSummary.response_rate_quality !== 'complete') {
    lines.push(
      'A taxa de resposta deste ciclo é parcial ou ainda em coleta — interpretar o NPS com essa limitação.',
    );
  }

  if (currentSummary?.reconstruction_status === 'partial' || currentSummary?.historical_gap) {
    lines.push(
      'Há limitações documentadas de reconstrução histórica ou gap versus referência externa no ciclo anterior.',
    );
  }

  return lines;
}

export function migrationCellKey(from, to) {
  return `${from} -> ${to}`;
}

export function parseMigrationCellKey(key) {
  const [from, to] = key.split(' -> ');
  return { from, to };
}

export function getEpSummaryEntries(epSummaryDoc, cycleCode) {
  return (epSummaryDoc?.entries ?? []).filter((e) => e.cycle_code === cycleCode);
}

export function findEpSummaryEntry(entries, epIdOrName) {
  if (!epIdOrName) return null;
  return (
    entries.find((e) => e.ep_id === epIdOrName || e.ep_name === epIdOrName) ?? null
  );
}

export function getEpResponsesForCycle(responses, cycleCode, epIdOrName) {
  return (responses ?? []).filter((r) => {
    if (r.analytical_cycle_code !== cycleCode) return false;
    if (!epIdOrName) return true;
    return r.ep_id === epIdOrName || r.ep_name === epIdOrName;
  });
}

/** Filtros sobre linhas ep_summary (EP, delta). */
export function filterEpSummaries(entries, filters) {
  let out = [...entries];
  if (filters.ep) {
    out = out.filter((e) => e.ep_name === filters.ep);
  }
  if (filters.deltaMin != null && filters.deltaMin !== '') {
    const min = Number(filters.deltaMin);
    out = out.filter((e) => e.delta_nps_paired != null && e.delta_nps_paired >= min);
  }
  if (filters.deltaMax != null && filters.deltaMax !== '') {
    const max = Number(filters.deltaMax);
    out = out.filter((e) => e.delta_nps_paired != null && e.delta_nps_paired <= max);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    out = out.filter((e) => (e.ep_name && e.ep_name.toLowerCase().includes(q)));
  }
  return out;
}

/** Restringe EPs quando há filtro de categoria/nota (via respostas). */
export function filterEpSummariesByClientFilters(entries, responses, cycleCode, filters) {
  const hasCat =
    filters.category ||
    (filters.scoreMin != null && filters.scoreMin !== '') ||
    (filters.scoreMax != null && filters.scoreMax !== '');
  if (!hasCat) return entries;

  let rows = getResponsesForCycle(responses, cycleCode);
  rows = filterResponses(rows, { ...filters, ep: '' }, {});
  const epNames = new Set(rows.map((r) => r.ep_name).filter(Boolean));
  return entries.filter((e) => epNames.has(e.ep_name));
}

export function sortEpSummariesByName(entries, dir = 'asc') {
  return [...entries].sort((a, b) => {
    const cmp = (a.ep_name ?? '').localeCompare(b.ep_name ?? '', 'pt-BR');
    return dir === 'desc' ? -cmp : cmp;
  });
}

export function computeEpPageKpis(entries, minSample = 5) {
  const withN = entries.filter((e) => e.valid_responses > 0);
  const validTotal = withN.reduce((a, e) => a + e.valid_responses, 0);
  const lowConf = withN.reduce((a, e) => a + (e.ep_low_confidence ?? 0), 0);
  return {
    epsWithResponses: withN.length,
    validResponses: validTotal,
    smallSampleEps: withN.filter((e) => e.valid_responses < minSample).length,
    lowConfidenceResponses: lowConf,
    lowConfidencePct: validTotal ? (lowConf / validTotal) * 100 : 0,
  };
}

export function epQualityLabel(entry) {
  const low = entry.ep_low_confidence ?? 0;
  const high = entry.ep_high_confidence ?? 0;
  const med = entry.ep_medium_confidence ?? 0;
  if (low > 0) return 'parcial';
  if (high >= med) return 'alta';
  if (med > 0) return 'média';
  return 'alta';
}

export function hasVocData(topicSummaryDoc, responseTopics) {
  return (
    Array.isArray(responseTopics) &&
    responseTopics.length > 0 &&
    topicSummaryDoc != null &&
    Array.isArray(topicSummaryDoc.entries)
  );
}

export function getTopicSummaryEntries(topicSummaryDoc, cycleCode) {
  return (topicSummaryDoc?.entries ?? []).filter((e) => e.analytical_cycle_code === cycleCode);
}

export function getResponseTopicsForCycle(responseTopics, cycleCode) {
  return (responseTopics ?? []).filter((t) => t.analytical_cycle_code === cycleCode);
}

export function getTopicOptions(responseTopics, cycleCode) {
  const set = new Set();
  for (const t of getResponseTopicsForCycle(responseTopics, cycleCode)) {
    if (t.topic) set.add(t.topic);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Linhas da tabela VoC (uma por tema atribuído). */
export function buildVocCommentRows(responses, responseTopics, cycleCode, filters = {}) {
  const cycleResponses = getResponsesForCycle(responses, cycleCode);
  const byId = new Map(cycleResponses.map((r) => [r.response_id, r]));
  let topics = getResponseTopicsForCycle(responseTopics, cycleCode);

  if (filters.topic) topics = topics.filter((t) => t.topic === filters.topic);
  if (filters.valence) topics = topics.filter((t) => t.valence === filters.valence);

  let rows = topics.map((t) => {
    const r = byId.get(t.response_id);
    if (!r) return null;
    return {
      response_id: t.response_id,
      client_name: r.client_name,
      client_code: r.client_code,
      ep_name: r.ep_name,
      score: r.score,
      nps_category: r.nps_category,
      topic: t.topic,
      valence: t.valence,
      comment: r.comment,
      cycle_name: r.analytical_cycle_name,
      analytical_cycle_code: r.analytical_cycle_code,
      confidence: t.confidence,
      classification_source: t.classification_source,
      reviewed: t.reviewed,
    };
  }).filter(Boolean);

  if (filters.ep) rows = rows.filter((r) => r.ep_name === filters.ep);
  if (filters.category) rows = rows.filter((r) => r.nps_category === filters.category);

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.comment && r.comment.toLowerCase().includes(q)) ||
        (r.client_name && r.client_name.toLowerCase().includes(q)) ||
        (r.client_code && r.client_code.toLowerCase().includes(q)),
    );
  }

  return rows;
}

function hasCommentText(comment) {
  return Boolean(String(comment ?? '').trim());
}

export function computeVocPageKpis(responses, responseTopics, cycleCode) {
  const cycleResponses = getResponsesForCycle(responses, cycleCode);
  const analyzed = cycleResponses.filter((r) => hasCommentText(r.comment));
  const topicRows = getResponseTopicsForCycle(responseTopics, cycleCode);
  const withTopicIds = new Set(topicRows.map((t) => t.response_id));
  const negativeCommentIds = new Set();
  const byResponseValence = new Map();
  for (const t of topicRows) {
    if (!byResponseValence.has(t.response_id)) byResponseValence.set(t.response_id, []);
    byResponseValence.get(t.response_id).push(t.valence);
  }
  for (const [rid, valences] of byResponseValence) {
    if (valences.includes('Negativa')) negativeCommentIds.add(rid);
  }
  const distinctTopics = new Set(topicRows.map((t) => t.topic));
  let multitopic = 0;
  for (const topics of byResponseValence.values()) {
    if (new Set(topics).size > 1) multitopic++;
  }
  const withTopic = [...withTopicIds].filter((id) => analyzed.some((r) => r.response_id === id)).length;
  const denomMult = withTopic || 1;
  return {
    commentsAnalyzed: analyzed.length,
    commentsWithTopic: withTopic,
    distinctTopics: distinctTopics.size,
    pctNegativeComments: analyzed.length ? (negativeCommentIds.size / analyzed.length) * 100 : 0,
    pctMultitopic: (multitopic / denomMult) * 100,
  };
}

export function sortTopicSummaries(entries, sortKey = 'responses_with_topic', dir = 'desc') {
  return [...entries].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string') {
      const cmp = av.localeCompare(String(bv), 'pt-BR');
      return dir === 'desc' ? -cmp : cmp;
    }
    return dir === 'desc' ? bv - av : av - bv;
  });
}

const ACTION_PENDING_STATUSES = new Set([
  'Novo',
  'Em análise',
  'Contatado',
  'Em acompanhamento',
]);

const DEFAULT_ACTION_STATUS = 'Novo';

function trackingKey(clientId, cycleCode) {
  return `${clientId}::${cycleCode}`;
}

export function mergeActionTrackingIntoQueue(enrichedEntries, trackingDoc) {
  const byKey = new Map();
  for (const t of trackingDoc?.entries ?? []) {
    if (!t.client_id || !t.cycle_code) continue;
    byKey.set(trackingKey(t.client_id, t.cycle_code), t);
  }
  return (enrichedEntries ?? []).map((row) => {
    const track = byKey.get(trackingKey(row.client_id, row.cycle_code));
    return {
      ...row,
      status: track?.status ?? DEFAULT_ACTION_STATUS,
      owner: track?.owner ?? '',
      action_notes: track?.action_notes ?? '',
      tracking_updated_at: track?.updated_at ?? null,
    };
  });
}

const PRIORITY_SORT_RANK = { Alta: 4, Média: 3, Investigar: 2, Aprendizado: 1 };

export function getActionQueueEnrichedForCycle(doc, cycleCode) {
  const entries = doc?.entries ?? [];
  if (!cycleCode) return entries;
  return entries.filter((e) => e.cycle_code === cycleCode);
}

/** Filtros da página Plano de Ação (KPIs + tabela). */
export function filterActionPlanRows(rows, filters, local = {}) {
  let out = [...(rows ?? [])];

  if (filters.priority) {
    out = out.filter((r) => r.priority === filters.priority);
  }
  if (filters.ep) {
    out = out.filter((r) => r.ep_name === filters.ep);
  }
  if (filters.category) {
    out = out.filter((r) => r.current_category === filters.category);
  }
  if (filters.migrationCell) {
    const normalized = filters.migrationCell.includes('→')
      ? filters.migrationCell
      : filters.migrationCell.replace(' -> ', ' → ');
    out = out.filter((r) => r.nps_migration === normalized);
  }
  if (filters.hasCsat === 'yes') {
    out = out.filter((r) => r.has_csat);
  }
  if (filters.hasCsat === 'no') {
    out = out.filter((r) => !r.has_csat);
  }
  if (filters.topic) {
    out = out.filter((r) => (r.topics ?? []).some((t) => t.topic === filters.topic));
  }
  if (local.actionStatus) {
    out = out.filter((r) => r.status === local.actionStatus);
  }
  if (local.search) {
    const q = local.search.toLowerCase();
    out = out.filter(
      (r) =>
        (r.client_name && r.client_name.toLowerCase().includes(q)) ||
        (r.ep_name && r.ep_name.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q)),
    );
  }
  return out;
}

export function computeActionPlanKpis(rows) {
  const counts = { Alta: 0, Média: 0, Investigar: 0, Aprendizado: 0 };
  let pending = 0;
  for (const r of rows ?? []) {
    if (counts[r.priority] != null) counts[r.priority] += 1;
    if (ACTION_PENDING_STATUSES.has(r.status)) pending += 1;
  }
  return { ...counts, pending };
}

export function sortActionPlanRows(rows, sortKey, sortDir) {
  const mul = sortDir === 'desc' ? -1 : 1;
  return [...(rows ?? [])].sort((a, b) => {
    if (sortKey === 'priority') {
      const ra = PRIORITY_SORT_RANK[a.priority] ?? 0;
      const rb = PRIORITY_SORT_RANK[b.priority] ?? 0;
      return (rb - ra) * mul;
    }
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv), 'pt-BR') * mul;
  });
}

export function buildActionPlanCsv(rows) {
  const header = [
    'priority',
    'client_name',
    'ep_name',
    'previous_score',
    'current_score',
    'score_delta',
    'nps_migration',
    'topics',
    'reason',
    'status',
    'owner',
  ];
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    const topics = (r.topics ?? []).map((t) => `${t.topic}/${t.valence}`).join('; ');
    lines.push(
      [
        r.priority,
        r.client_name,
        r.ep_name,
        r.previous_score,
        r.current_score,
        r.score_delta,
        r.nps_migration,
        topics,
        r.reason,
        r.status,
        r.owner,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n');
}
