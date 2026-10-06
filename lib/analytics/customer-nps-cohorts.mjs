/**
 * Camada analítica derivada: safra, cobertura NPS, histórico consolidado + respostas atuais.
 * Não altera fontes (BASE QV, nps_historico, respostas operacionais).
 */
import { classifyNpsScore, isValidScore } from './nps.mjs';
import { resolveAnalyticalActiveClient } from './analytical-active-client.mjs';

export const HISTORICO_OFFICIAL_MEDICOES = [
  { ciclo: '2025-Q2', respostas: 108, nps: 21.3 },
  { ciclo: '2025-Q3', respostas: 50, nps: 24.0 },
  { ciclo: '2025-Q4', respostas: 171, nps: 35.1 },
  { ciclo: '2026-Q1', respostas: 194, nps: 45.9 },
  { ciclo: '2026-Q2', respostas: 262, nps: 68.7 },
  { ciclo: '2026-Q3', respostas: 282, nps: 59.6 },
];

export function normalizeNameKey(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseTs(v) {
  if (v == null || v === '') return null;
  const t = new Date(String(v).replace(' ', 'T')).getTime();
  return Number.isNaN(t) ? null : t;
}

function toIso(v) {
  const t = parseTs(v);
  return t == null ? null : new Date(t).toISOString();
}

export function safraFromDate(isoDate) {
  if (!isoDate) return { safra_mes: null, safra_trimestre: null, safra_ano: null };
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return { safra_mes: null, safra_trimestre: null, safra_ano: null };
  }
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const q = Math.ceil(m / 3);
  return {
    safra_mes: `${y}-${String(m).padStart(2, '0')}`,
    safra_trimestre: `${y}-Q${q}`,
    safra_ano: String(y),
  };
}

/**
 * @param {object} client row clients.json
 * @param {object|null} journey row client_journeys
 */
export function resolveClientEntryDate(client, journey) {
  const ciclo = client?.data_inicio_ciclo ?? null;
  if (parseTs(ciclo)) {
    return { data_entrada: toIso(ciclo), safra_source: 'base_qv', entry_field: 'clients.data_inicio_ciclo' };
  }
  const started = journey?.started_at ?? null;
  if (parseTs(started)) {
    return {
      data_entrada: toIso(started),
      safra_source: 'base_qv',
      entry_field: 'client_journeys.started_at',
    };
  }
  const created = client?.created_at ?? null;
  if (parseTs(created)) {
    return { data_entrada: toIso(created), safra_source: 'base_qv', entry_field: 'clients.created_at' };
  }
  return { data_entrada: null, safra_source: 'unavailable', entry_field: null };
}

export function parseHistoricoInicioPrograma(text) {
  const s = (text ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-01T00:00:00.000Z`;
  const d = parseTs(s);
  return d == null ? null : new Date(d).toISOString();
}

export function responseDedupeKey(row) {
  const id =
    row.typeform_response_id ??
    row.source_response_id ??
    row.id_resposta ??
    row.response_id ??
    row.chave_import ??
    null;
  if (id) return `id:${id}`;
  const at = toIso(row.submitted_at ?? row.data_resposta);
  const client = row.client_id ?? row.id_cliente ?? normalizeNameKey(row.client_name ?? row.cliente);
  const cycle = row.analytical_cycle_code ?? row.ciclo ?? '';
  return `weak:${client}|${cycle}|${at}|${row.score ?? row.nota_nps ?? ''}`;
}

export function mapCurrentResponse(row) {
  const score = row.score;
  return {
    source: 'current',
    precedence: 2,
    response_key: responseDedupeKey(row),
    client_id: row.client_id ?? null,
    client_name: row.client_name ?? null,
    client_name_key: normalizeNameKey(row.client_name),
    ciclo: row.analytical_cycle_code ?? null,
    ciclo_label: row.analytical_cycle_name ?? row.analytical_cycle_code,
    data_resposta: toIso(row.submitted_at),
    nota_nps: isValidScore(score) ? Number(score) : null,
    categoria: row.nps_category ?? classifyNpsScore(score),
    programa: row.program ?? 'PHARUS',
    ep: row.ep_name ?? null,
    typeform_response_id: row.typeform_response_id ?? null,
    historico_fields: null,
  };
}

export function mapHistoricoResponse(row) {
  const score = row.nota_nps != null ? Number(row.nota_nps) : null;
  return {
    source: 'historical',
    precedence: 1,
    response_key: responseDedupeKey({
      id_resposta: row.id_resposta,
      chave_import: row.chave_import,
      client_id: row.id_cliente,
      ciclo: row.ciclo,
      data_resposta: row.data_resposta,
      nota_nps: row.nota_nps,
      client_name: row.cliente,
    }),
    client_id: null,
    client_name: row.cliente ?? null,
    client_name_key: normalizeNameKey(row.id_cliente || row.cliente),
    id_cliente_hist: row.id_cliente ?? null,
    ciclo: row.ciclo ?? null,
    ciclo_label: row.ciclo_nome ?? row.ciclo,
    data_resposta: toIso(row.data_resposta),
    nota_nps: isValidScore(score) ? score : null,
    categoria: row.categoria ?? classifyNpsScore(score),
    programa: row.programa ?? 'PHARUS',
    ep: row.ep ?? null,
    typeform_response_id: row.id_resposta ?? null,
    historico_fields: {
      nota_estrategista: row.nota_estrategista ?? null,
      nota_backoffice: row.nota_backoffice ?? null,
      nota_qv360: row.nota_qv360 ?? null,
      nota_arquitetura_patrimonial: row.nota_arquitetura_patrimonial ?? null,
      plano_patrimonial: row.plano_patrimonial ?? null,
      plano_apresentado: row.plano_apresentado ?? null,
      caminho: row.caminho ?? null,
      momento: row.momento ?? null,
      motivo_nota: row.motivo_nota ?? null,
      melhoria: row.melhoria ?? null,
      razao_positiva: row.razao_positiva ?? null,
      retencao_5_anos: row.retencao_5_anos ?? null,
      comentario_adicional: row.comentario_adicional ?? null,
      reunioes_realizadas: row.reunioes_realizadas ?? null,
      inicio_programa: row.inicio_programa ?? null,
      versao_formulario: row.versao_formulario ?? null,
    },
  };
}

export function mergeResponses(currentRows, historicoRows) {
  const map = new Map();
  for (const r of historicoRows.map(mapHistoricoResponse)) {
    map.set(r.response_key, r);
  }
  for (const r of currentRows.map(mapCurrentResponse)) {
    const prev = map.get(r.response_key);
    if (!prev || r.precedence >= prev.precedence) map.set(r.response_key, r);
  }
  return [...map.values()].filter((r) => r.nota_nps != null);
}

function daysBetween(aIso, bIso) {
  const a = parseTs(aIso);
  const b = parseTs(bIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

function npsFromScores(scores) {
  if (!scores.length) return null;
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return Math.round(((100 * prom - 100 * det) / scores.length) * 10) / 10;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * @param {object} input
 * @returns {{ customers: object[], history: object[], audit: object, summaries: object }}
 */
export function buildCustomerNpsCohortsDataset(input) {
  const {
    clients = [],
    journeys = [],
    cancellations = [],
    freezeRows = [],
    currentResponses = [],
    historicoResponses = [],
    appRows = [],
    epNameById = new Map(),
  } = input;

  const journeyByClient = new Map(journeys.map((j) => [j.client_id, j]));
  const mergedResponses = mergeResponses(currentResponses, historicoResponses);

  const pharusClients = clients.filter((c) => (c.programa ?? '').toUpperCase() === 'PHARUS');
  const byNorm = new Map();
  for (const c of pharusClients) {
    byNorm.set(normalizeNameKey(c.name), c);
    if (c.codigo) byNorm.set(normalizeNameKey(c.codigo), c);
  }

  const responsesByClientId = new Map();
  const unmatchedHist = [];

  for (const r of mergedResponses) {
    let cid = r.client_id;
    if (!cid && r.client_name_key) {
      const c = byNorm.get(r.client_name_key);
      if (c) cid = c.id;
    }
    if (!cid) {
      unmatchedHist.push(r);
      continue;
    }
    if (!responsesByClientId.has(cid)) responsesByClientId.set(cid, []);
    responsesByClientId.get(cid).push({ ...r, client_id: cid });
  }

  const clientIds = new Set(pharusClients.map((c) => c.id));
  for (const cid of responsesByClientId.keys()) clientIds.add(cid);

  const appByClient = new Map();
  for (const row of appRows) {
    if (row.client_id) appByClient.set(row.client_id, row);
  }

  const historicoInicioByClient = new Map();
  for (const r of historicoResponses) {
    const key = normalizeNameKey(r.id_cliente || r.cliente);
    const c = byNorm.get(key);
    if (!c || !r.inicio_programa) continue;
    if (!historicoInicioByClient.has(c.id)) historicoInicioByClient.set(c.id, r.inicio_programa);
  }

  const customers = [];
  const history = [];
  const fieldCoverage = {};
  const countField = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const key = `${prefix}.${k}`;
      if (v != null && String(v).trim() !== '') fieldCoverage[key] = (fieldCoverage[key] ?? 0) + 1;
    }
  };

  for (const r of historicoResponses) countField(mapHistoricoResponse(r).historico_fields, 'historico');

  for (const clientId of clientIds) {
    const client = pharusClients.find((c) => c.id === clientId) ?? {
      id: clientId,
      name: responsesByClientId.get(clientId)?.[0]?.client_name ?? '—',
      programa: 'PHARUS',
      status: null,
    };
    const journey = journeyByClient.get(clientId);
    let entry = resolveClientEntryDate(client, journey);
    if (!entry.data_entrada && historicoInicioByClient.has(clientId)) {
      const parsed = parseHistoricoInicioPrograma(historicoInicioByClient.get(clientId));
      if (parsed) {
        entry = {
          data_entrada: parsed,
          safra_source: 'nps_historico_inicio_programa',
          entry_field: 'nps_historico.respostas.inicio_programa',
        };
      }
    }
    const safra = safraFromDate(entry.data_entrada);
    const active = resolveAnalyticalActiveClient(client, { cancellations, freezeRows });

    const resp = (responsesByClientId.get(clientId) ?? []).sort(
      (a, b) => (parseTs(a.data_resposta) ?? 0) - (parseTs(b.data_resposta) ?? 0),
    );
    const scores = resp.map((x) => x.nota_nps).filter((s) => s != null);
    const cycles = [...new Set(resp.map((x) => x.ciclo).filter(Boolean))];
    const first = resp[0] ?? null;
    const last = resp[resp.length - 1] ?? null;
    const histCount = resp.filter((x) => x.source === 'historical').length;
    const curCount = resp.filter((x) => x.source === 'current').length;

    const epId = client.engenheiro_patrimonial ?? null;
    const epName =
      (epId && epNameById.get(epId)) ||
      last?.ep ||
      client.engenheiro_patrimonial_name ||
      null;

    const app = appByClient.get(clientId) ?? null;
    const daysEntry = first ? daysBetween(entry.data_entrada, first.data_resposta) : null;

    const row = {
      client_id: clientId,
      client_name: client.name ?? null,
      programa: client.programa ?? 'PHARUS',
      ep: epName,
      data_entrada: entry.data_entrada,
      safra_mes: safra.safra_mes,
      safra_trimestre: safra.safra_trimestre,
      safra_ano: safra.safra_ano,
      safra_source: entry.safra_source,
      entry_field: entry.entry_field,
      status_cliente: client.status ?? null,
      cliente_ativo: active?.is_active_analytical ?? null,
      has_app_access: app?.has_app_access ?? null,
      app_first_access_at: app?.app_first_access_at ?? null,
      app_last_access_at: app?.app_last_access_at ?? null,
      app_match_status: app?.app_match_status ?? 'not_found',
      app_access_proxy: app?.app_access_proxy ?? null,
      ever_answered_nps: resp.length > 0,
      never_answered_nps: resp.length === 0,
      nps_response_count: resp.length,
      first_nps_at: first?.data_resposta ?? null,
      last_nps_at: last?.data_resposta ?? null,
      last_nps_score: last?.nota_nps ?? null,
      last_nps_category: last?.categoria ?? null,
      avg_nps_score: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
      min_nps_score: scores.length ? Math.min(...scores) : null,
      max_nps_score: scores.length ? Math.max(...scores) : null,
      first_nps_cycle: first?.ciclo ?? null,
      last_nps_cycle: last?.ciclo ?? null,
      nps_score_delta:
        first && last && first.nota_nps != null && last.nota_nps != null
          ? Math.round((last.nota_nps - first.nota_nps) * 10) / 10
          : null,
      nps_cycles_answered: cycles,
      answered_multiple_cycles: cycles.length > 1,
      answered_once: resp.length === 1,
      answered_multiple_times: resp.length > 1,
      days_entry_to_first_nps: daysEntry,
      days_entry_to_first_nps_valid: daysEntry != null && daysEntry >= 0 ? daysEntry : null,
      historical_response_count: histCount,
      current_response_count: curCount,
    };
    customers.push(row);

    for (const h of resp) {
      history.push({
        client_id: clientId,
        client_name: row.client_name,
        ciclo: h.ciclo,
        data_resposta: h.data_resposta,
        nota_nps: h.nota_nps,
        categoria: h.categoria,
        source: h.source,
        response_key: h.response_key,
        safra_trimestre: row.safra_trimestre,
        ep: h.ep ?? row.ep,
        historico_fields: h.historico_fields ?? null,
      });
    }
  }

  customers.sort((a, b) => (a.client_name ?? '').localeCompare(b.client_name ?? '', 'pt-BR'));

  const answered = customers.filter((c) => c.ever_answered_nps);
  const never = customers.filter((c) => c.never_answered_nps);
  const withSafra = customers.filter((c) => c.safra_trimestre);
  const daysValid = customers.map((c) => c.days_entry_to_first_nps_valid).filter((d) => d != null);
  daysValid.sort((a, b) => a - b);

  const safraAgg = new Map();
  for (const c of customers) {
    const key = c.safra_trimestre ?? 'Não informado';
    if (!safraAgg.has(key)) {
      safraAgg.set(key, { safra: key, clientes_total: 0, responderam: 0, nunca: 0, scores: [], respostas: 0 });
    }
    const g = safraAgg.get(key);
    g.clientes_total += 1;
    if (c.ever_answered_nps) g.responderam += 1;
    else g.nunca += 1;
    g.respostas += c.nps_response_count;
  }
  for (const h of history) {
    const c = customers.find((x) => x.client_id === h.client_id);
    const key = c?.safra_trimestre ?? 'Não informado';
    const g = safraAgg.get(key);
    if (g && h.nota_nps != null) g.scores.push(h.nota_nps);
  }

  const safraSummaries = [...safraAgg.values()].map((g) => ({
    safra_trimestre: g.safra,
    clientes_total: g.clientes_total,
    clientes_que_responderam: g.responderam,
    clientes_nunca_responderam: g.nunca,
    pct_que_ja_responderam: g.clientes_total ? Math.round((1000 * g.responderam) / g.clientes_total) / 10 : null,
    respostas_total: g.respostas,
    respostas_por_cliente: g.clientes_total ? Math.round((100 * g.respostas) / g.clientes_total) / 100 : null,
    nps_atual: npsFromScores(g.scores),
    nota_media: g.scores.length
      ? Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 100) / 100
      : null,
    promotores: g.scores.filter((s) => s >= 9).length,
    neutros: g.scores.filter((s) => s >= 7 && s <= 8).length,
    detratores: g.scores.filter((s) => s <= 6).length,
  }));

  safraSummaries.sort((a, b) => {
    if (a.safra_trimestre === 'Não informado') return 1;
    if (b.safra_trimestre === 'Não informado') return -1;
    return a.safra_trimestre.localeCompare(b.safra_trimestre);
  });

  const matrix = new Map();
  for (const h of history) {
    const c = customers.find((x) => x.client_id === h.client_id);
    const safra = c?.safra_trimestre ?? 'Não informado';
    const ciclo = h.ciclo ?? '?';
    const key = `${safra}||${ciclo}`;
    if (!matrix.has(key)) matrix.set(key, []);
    if (h.nota_nps != null) matrix.get(key).push(h.nota_nps);
  }
  const safraMedicaoMatrix = [...matrix.entries()].map(([key, scores]) => {
    const [safra, ciclo] = key.split('||');
    return { safra_trimestre: safra, ciclo, respostas: scores.length, nps: npsFromScores(scores), nota_media: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
  });

  const appWith = customers.filter((c) => c.has_app_access === true);
  const appWithout = customers.filter((c) => c.has_app_access === false);
  const appUnknown = customers.filter((c) => c.has_app_access == null);

  const audit = {
    generated_at: new Date().toISOString(),
    safra_entry_field_chosen: 'clients.data_inicio_ciclo',
    safra_fallback_chain: [
      'clients.data_inicio_ciclo',
      'client_journeys.started_at',
      'clients.created_at',
      'nps_historico.respostas.inicio_programa (somente se BASE QV indisponível por cliente)',
    ],
    pharus_clients_in_base: pharusClients.length,
    clients_analyzed: customers.length,
    with_safra_trimestre: withSafra.length,
    without_safra: customers.length - withSafra.length,
    safra_source_counts: customers.reduce((acc, c) => {
      acc[c.safra_source] = (acc[c.safra_source] ?? 0) + 1;
      return acc;
    }, {}),
    data_inicio_ciclo_coverage_pct: pharusClients.length
      ? Math.round((1000 * pharusClients.filter((c) => c.data_inicio_ciclo).length) / pharusClients.length) / 10
      : null,
    ever_answered_nps: answered.length,
    never_answered_nps: never.length,
    pct_ever_answered: customers.length
      ? Math.round((1000 * answered.length) / customers.length) / 10
      : null,
    merged_responses_total: mergedResponses.length,
    current_responses_input: currentResponses.length,
    historico_responses_input: historicoResponses.length,
    historico_unmatched_to_client: unmatchedHist.length,
    dedupe_rule:
      'Mesma response_key: respostas atuais (precedence 2) substituem histórico (1); chaves fortes = typeform/id_resposta/chave_import',
    historico_official_medicoes: HISTORICO_OFFICIAL_MEDICOES,
    app_source: appRows.length ? appRows[0].source_note ?? 'configured' : 'not_configured',
    app_clients_matched: appWith.length,
    app_unknown: appUnknown.length,
    app_match_status_counts: customers.reduce((acc, c) => {
      acc[c.app_match_status] = (acc[c.app_match_status] ?? 0) + 1;
      return acc;
    }, {}),
    nps_app_vs_no_app: {
      with_app_n: appWith.filter((c) => c.last_nps_score != null).length,
      without_app_n: appWithout.filter((c) => c.last_nps_score != null).length,
      with_app_nps: npsFromScores(appWith.map((c) => c.last_nps_score).filter((s) => s != null)),
      without_app_nps: npsFromScores(
        [...appWithout, ...appUnknown].map((c) => c.last_nps_score).filter((s) => s != null),
      ),
      note: 'Associação descritiva; diferença não implica causalidade.',
    },
    days_entry_to_first_nps: {
      n_valid: daysValid.length,
      median: percentile(daysValid, 0.5),
      mean: daysValid.length ? Math.round(daysValid.reduce((a, b) => a + b, 0) / daysValid.length) : null,
      p25: percentile(daysValid, 0.25),
      p75: percentile(daysValid, 0.75),
      n_invalid_negative: customers.filter((c) => (c.days_entry_to_first_nps ?? 0) < 0).length,
    },
    historico_field_coverage: fieldCoverage,
    historico_rows: historicoResponses.length,
    inicio_programa_filled: historicoResponses.filter((r) => (r.inicio_programa ?? '').trim()).length,
  };

  return {
    customers,
    history,
    audit,
    summaries: {
      by_safra: safraSummaries,
      safra_x_medicao: safraMedicaoMatrix,
    },
  };
}
