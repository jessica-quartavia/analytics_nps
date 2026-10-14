function isValidScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= 10;
}

function classifyNpsScore(score) {
  if (score <= 6) return 'Detrator';
  if (score <= 8) return 'Neutro';
  return 'Promotor';
}

export const EXECUTIVE_KPI_LABELS = {
  clientsWithSend: 'Envios (ciclo T3)',
  validResponses: 'Respostas',
  responseRate: 'Taxa de resposta',
};

export const POPULATION_TIPS = {
  clientsWithSend:
    'Registros em nps_sends do ciclo NPS 2026-T3 (GERAL — PHARUS + DAVOS). Um registro por cliente enviado.',
  responseRate: (valid, eligible) =>
    `Respostas válidas no universo oficial ÷ envios do ciclo. Neste ciclo: ${valid} respostas / ${eligible} envios.`,
  validResponses:
    'Respostas NPS válidas no ciclo: uma por cliente (última resposta válida na janela T3 / GERAL).',
};

/** Status CRM documentado na auditoria Set/2026 (snapshot elegíveis). */
export const SET_2026_CRM_STATUS_DOC = {
  ativos: 950,
  congelados: 13,
  churn: 4,
  note:
    'O status exibido é o status disponível no snapshot atual e não deve ser usado retroativamente para redefinir a população histórica.',
};

export function normProgram(p) {
  return (p ?? '').trim().toUpperCase();
}

export function dedupeStatsFromAudit(auditDoc) {
  const d = auditDoc?.dedupe?.from_ingest_nps_responses;
  if (!d) {
    return null;
  }
  return {
    raw_rows: d.raw_rows_in_window,
    duplicates_treated: d.duplicates_found,
    final_valid: d.final_rows,
  };
}

export function filterRespondentRows(responses, cycleCode) {
  return (responses ?? []).filter(
    (r) => r.analytical_cycle_code === cycleCode && isValidScore(r.score),
  );
}

export function validatePopulationInvariants(responses, cycleCode, summary) {
  const rows = filterRespondentRows(responses, cycleCode);
  const ids = new Set(rows.map((r) => r.client_id));
  const prog = { PHARUS: 0, DAVOS: 0, other: 0, missing: 0 };
  for (const r of rows) {
    const p = normProgram(r.program);
    if (p === 'PHARUS') prog.PHARUS++;
    else if (p === 'DAVOS') prog.DAVOS++;
    else if (!p) prog.missing++;
    else prog.other++;
  }
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of rows) {
    const c = classifyNpsScore(r.score);
    if (c === 'Promotor') promoters++;
    else if (c === 'Neutro') passives++;
    else detractors++;
  }
  const eligible = summary?.eligible_clients ?? null;
  const rate =
    eligible && rows.length ? rows.length / eligible : summary?.response_rate ?? null;

  return {
    count: rows.length,
    distinct_clients: ids.size,
    program: prog,
    promoters,
    passives,
    detractors,
    nps: rows.length ? ((promoters - detractors) / rows.length) * 100 : null,
    response_rate: rate,
    matches_summary:
      summary &&
      rows.length === summary.valid_responses &&
      promoters === summary.promoters &&
      passives === summary.passives &&
      detractors === summary.detractors,
  };
}

export function filterRespondentTableRows(rows, { search = '', ep = '', category = '' } = {}) {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (ep && (r.ep_name ?? '') !== ep) return false;
    if (category && (r.nps_category ?? '') !== category) return false;
    if (!q) return true;
    const hay = `${r.client_name ?? ''} ${r.client_code ?? ''} ${r.ep_name ?? ''}`.toLowerCase();
    return hay.includes(q);
  });
}
