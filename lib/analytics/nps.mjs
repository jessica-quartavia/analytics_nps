/** @typedef {'Promotor' | 'Neutro' | 'Detrator'} NpsCategory */

/**
 * Classificação NPS oficial (0–10).
 * @param {number} score
 * @returns {NpsCategory}
 */
export function classifyNpsScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new RangeError(`score must be integer 0–10, got ${score}`);
  }
  if (score <= 6) return 'Detrator';
  if (score <= 8) return 'Neutro';
  return 'Promotor';
}

export function isValidScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= 10;
}

/** @deprecated alias — prefer isValidScore */
export const isValidNpsScore = isValidScore;

/** @deprecated alias — prefer classifyNpsScore */
export function npsCategory(score) {
  return classifyNpsScore(score);
}

/**
 * @param {object} row
 * @returns {number | null}
 */
export function npsScoreFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  const raw = row.score ?? row.nota;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  const score = Math.trunc(n);
  if (score !== n) return null;
  return score;
}

/**
 * Identificador forte do cliente para dedupe NPS.
 * @param {object} row
 * @returns {string | null}
 */
export function npsClientId(row) {
  if (!row) return null;
  const id = row.client_id ?? row.base_qv_id ?? null;
  return id != null && String(id).trim() !== '' ? String(id) : null;
}

/**
 * @param {object} row
 * @returns {number}
 */
export function npsResponseTimestampMs(row) {
  if (!row) return 0;
  for (const field of ['submitted_at', 'response_date', 'data_resposta', 'created_at']) {
    const v = row[field];
    if (v == null || v === '') continue;
    const s = String(v).trim();
    const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/**
 * Mantém a última resposta válida de cada cliente no recorte (ordem temporal + response_id).
 * @param {Array<object>} rows
 * @param {{ requireClientId?: boolean }} [opts]
 * @returns {Array<object>}
 */
export function dedupeLatestNpsByClient(rows, opts = {}) {
  const { requireClientId = true } = opts;
  /** @type {Map<string, object>} */
  const byClient = new Map();
  const noId = [];

  for (const row of rows ?? []) {
    const score = npsScoreFromRow(row);
    if (score == null) continue;
    const clientId = npsClientId(row);
    if (!clientId) {
      if (!requireClientId) noId.push({ ...row, score });
      continue;
    }
    const existing = byClient.get(clientId);
    if (!existing) {
      byClient.set(clientId, { ...row, score });
      continue;
    }
    const tNew = npsResponseTimestampMs(row);
    const tOld = npsResponseTimestampMs(existing);
    if (tNew > tOld) {
      byClient.set(clientId, { ...row, score });
      continue;
    }
    if (tNew < tOld) continue;
    const idNew = String(row.response_id ?? row.source_response_id ?? '');
    const idOld = String(existing.response_id ?? existing.source_response_id ?? '');
    if (idNew.localeCompare(idOld) > 0) {
      byClient.set(clientId, { ...row, score });
    }
  }

  return requireClientId ? [...byClient.values()] : [...byClient.values(), ...noId];
}

/**
 * Resultado oficial de agregação NPS (precisão completa; UI formata 1 decimal).
 * @param {ReturnType<typeof calculateNpsSummary>} summary
 */
export function formatNpsAggregateResult(summary) {
  const total = summary.total ?? 0;
  return {
    nps: summary.nps,
    responses: total,
    promoters: summary.promoters,
    neutrals: summary.passives,
    detractors: summary.detractors,
    passives: summary.passives,
    promoter_pct: summary.promoterPct,
    neutral_pct: summary.passivePct,
    detractor_pct: summary.detractorPct,
    promoterPct: summary.promoterPct,
    passivePct: summary.passivePct,
    detractorPct: summary.detractorPct,
    total,
  };
}

/**
 * filterValid → dedupeLatestByClient → calculateNps
 * @param {Array<object>} rows
 * @param {{ dedupe?: boolean, requireClientId?: boolean }} [opts]
 */
export function aggregateNpsFromResponses(rows, opts = {}) {
  const { dedupe = true, requireClientId = true } = opts;
  let working = (rows ?? []).filter((r) => npsScoreFromRow(r) != null);
  if (dedupe) {
    working = dedupeLatestNpsByClient(working, { requireClientId });
  }
  const summary = calculateNpsSummary(working.map((r) => ({ score: npsScoreFromRow(r) })));
  return {
    ...formatNpsAggregateResult(summary),
    average_score: meanNpsScoreFromRows(working),
  };
}

/**
 * Média aritmética das notas válidas (mesmo universo da agregação).
 * @param {Array<object>} rows
 */
export function meanNpsScoreFromRows(rows) {
  const scores = (rows ?? []).map((r) => npsScoreFromRow(r)).filter((s) => s != null);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * @param {object} row
 */
export function matchesOfficialNpsFormTipo(row) {
  const tipo = row?.tipo_de_forms ?? '';
  return tipo === '' || String(tipo).toUpperCase().startsWith('NPS');
}

/**
 * Resposta NPS válida para recorte operacional por janela (ex.: NPS 2026-T3 / GERAL).
 * Score válido, client_id, tipo NPS (ou vazio), submitted_at na janela.
 * @param {object} row
 * @param {{ starts_at?: string|null, ends_at?: string|null }} bounds
 */
export function matchesOfficialSourceCycleWindow(row, bounds) {
  if (!row?.client_id) return false;
  if (npsScoreFromRow(row) == null) return false;
  if (!matchesOfficialNpsFormTipo(row)) return false;
  const startsAt = bounds?.starts_at ?? null;
  const endsAt = bounds?.ends_at ?? null;
  const t = npsResponseTimestampMs(row);
  if (!t) return false;
  const startMs = startsAt ? Date.parse(startsAt) : Number.NEGATIVE_INFINITY;
  const endMs = endsAt ? Date.parse(endsAt) : Number.POSITIVE_INFINITY;
  return t >= startMs && t <= endMs;
}

/**
 * @param {Array<object>} rows
 * @param {{ starts_at?: string|null, ends_at?: string|null }} bounds
 */
export function filterOfficialSourceCycleWindowRows(rows, bounds) {
  return (rows ?? []).filter((r) => matchesOfficialSourceCycleWindow(r, bounds));
}

/**
 * Ciclo corrente (janela T3 / GERAL): todos os programas na janela;
 * KPI = última resposta válida por client_id (metodologia Analytics NPS).
 * @param {Array<object>} rows
 * @param {{ starts_at?: string|null, ends_at?: string|null }} bounds
 */
export function aggregateNpsForOfficialSourceCycleWindow(rows, bounds) {
  const filtered = filterOfficialSourceCycleWindowRows(rows, bounds);
  const deduped = dedupeLatestNpsByClient(filtered, { requireClientId: true });
  const summary = aggregateNpsFromResponses(deduped, { dedupe: false });
  return {
    ...summary,
    ...latestNpsResponseMeta(deduped, { dedupe: false }),
  };
}

/**
 * Respostas válidas para NPS (score 0–10).
 * @param {Array<{ score?: number | null }>} responses
 * @param {{ skipInvalid?: boolean }} [opts]
 * @returns {Array<{ score: number }>}
 */
export function filterValidNpsResponses(responses, opts = {}) {
  const { skipInvalid = true } = opts;
  const valid = [];
  for (const r of responses) {
    if (isValidScore(r.score)) {
      valid.push(r);
      continue;
    }
    if (!skipInvalid) {
      throw new RangeError(`Invalid NPS score: ${r.score}`);
    }
  }
  return valid;
}

/**
 * NPS = ((promoters - detractors) / total) * 100
 * @param {Array<{ score: number }>} responses
 * @returns {number | null}
 */
export function calculateNps(responses) {
  const valid = filterValidNpsResponses(responses, { skipInvalid: true });
  if (valid.length === 0) return null;

  let promoters = 0;
  let detractors = 0;
  for (const r of valid) {
    const cat = classifyNpsScore(r.score);
    if (cat === 'Promotor') promoters++;
    else if (cat === 'Detrator') detractors++;
  }
  return ((promoters - detractors) / valid.length) * 100;
}

/**
 * @param {Array<{ score: number }>} responses
 * @returns {{
 *   total: number,
 *   promoters: number,
 *   passives: number,
 *   detractors: number,
 *   promoterPct: number,
 *   passivePct: number,
 *   detractorPct: number,
 *   nps: number | null
 * }}
 */
export function calculateNpsSummary(responses) {
  const valid = filterValidNpsResponses(responses, { skipInvalid: true });
  const total = valid.length;
  if (total === 0) {
    return {
      total: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      promoterPct: 0,
      passivePct: 0,
      detractorPct: 0,
      nps: null,
    };
  }

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of valid) {
    const cat = classifyNpsScore(r.score);
    if (cat === 'Promotor') promoters++;
    else if (cat === 'Neutro') passives++;
    else detractors++;
  }

  const pct = (n) => (n / total) * 100;
  return {
    total,
    promoters,
    passives,
    detractors,
    promoterPct: pct(promoters),
    passivePct: pct(passives),
    detractorPct: pct(detractors),
    nps: ((promoters - detractors) / total) * 100,
  };
}

/**
 * Metadados da resposta NPS válida mais recente após dedupe por cliente no recorte.
 * @param {Array<object>} rows
 * @param {{ dedupe?: boolean, requireClientId?: boolean }} [opts]
 */
export function latestNpsResponseMeta(rows, opts = {}) {
  const { dedupe = true, requireClientId = true } = opts;
  let working = (rows ?? []).filter((r) => npsScoreFromRow(r) != null);
  if (dedupe) {
    working = dedupeLatestNpsByClient(working, { requireClientId });
  }
  let best = null;
  let bestTs = -1;
  for (const row of working) {
    const ts = npsResponseTimestampMs(row);
    if (ts < bestTs) continue;
    if (ts === bestTs && best) {
      const idNew = String(row.response_id ?? row.source_response_id ?? '');
      const idOld = String(best.response_id ?? best.source_response_id ?? '');
      if (idNew.localeCompare(idOld) <= 0) continue;
    }
    bestTs = ts;
    best = row;
  }
  if (!best) {
    return {
      latest_nps_response_at: null,
      latest_nps_response_id: null,
      latest_nps_client_id: null,
      latest_nps_score: null,
    };
  }
  const rawAt =
    best.submitted_at ?? best.response_date ?? best.data_resposta ?? best.created_at ?? null;
  return {
    latest_nps_response_at: rawAt != null ? String(rawAt) : null,
    latest_nps_response_id: best.response_id ?? best.source_response_id ?? null,
    latest_nps_client_id: npsClientId(best),
    latest_nps_score: npsScoreFromRow(best),
  };
}

/**
 * Recorte por ciclo analítico (+ PHARUS opcional) → dedupe → agregação oficial.
 */
export function aggregateNpsForAnalyticalCycle(responses, cycleCode, opts = {}) {
  const { program = 'PHARUS' } = opts;
  let rows = responses ?? [];
  if (cycleCode) {
    rows = rows.filter((r) => r.analytical_cycle_code === cycleCode);
  }
  if (program) {
    rows = rows.filter((r) => (r.program ?? '').toUpperCase() === program.toUpperCase());
  }
  rows = rows.filter((r) => npsScoreFromRow(r) != null);
  const deduped = dedupeLatestNpsByClient(rows, { requireClientId: true });
  return {
    ...aggregateNpsFromResponses(deduped, { dedupe: false }),
    ...latestNpsResponseMeta(deduped, { dedupe: false }),
  };
}
