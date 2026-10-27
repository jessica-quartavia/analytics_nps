import {
  classifyNpsScore,
  isValidScore,
  npsClientId,
  npsResponseTimestampMs,
  npsScoreFromRow,
  aggregateNpsFromResponses,
} from './nps.mjs';
import { normalizeClientStatus, isRawStatusActive } from './analytical-active-client.mjs';
import { normalizeBrazilUf, regionFromUf } from './brazil-uf-region.mjs';
import {
  classifyProfessionCategory,
  rollupProfessionCategoriesForPie,
} from './profession-category.mjs';

export const PROMOTOR_5_ESTRELAS_RULE = {
  id: 'nps_derived_promotor_5_estrelas',
  description:
    '≥2 respostas NPS válidas; as duas mais recentes são Promotor (9–10); a mais recente tem score = 10.',
  sort: 'submitted_at DESC, response_id DESC',
  does_not_use: ['clients.segmentacao'],
};

const NAO_INFORMADO = 'Não informado';

export function displayLabel(value) {
  const s = String(value ?? '').trim();
  return s ? s : NAO_INFORMADO;
}

export function compareLabelNaLast(a, b) {
  const la = displayLabel(a);
  const lb = displayLabel(b);
  if (la === NAO_INFORMADO && lb !== NAO_INFORMADO) return 1;
  if (lb === NAO_INFORMADO && la !== NAO_INFORMADO) return -1;
  return la.localeCompare(lb, 'pt-BR');
}

function responseSortId(row) {
  return String(row.id ?? row.response_id ?? row.source_response_id ?? '');
}

/**
 * Respostas NPS válidas do cliente, mais recentes primeiro.
 */
export function validNpsResponsesForClient(allResponses, clientId) {
  const rows = [];
  for (const r of allResponses ?? []) {
    if (npsClientId(r) !== clientId) continue;
    const score = npsScoreFromRow(r);
    if (score == null || !isValidScore(score)) continue;
    rows.push({ ...r, score });
  }
  rows.sort((a, b) => {
    const dt = npsResponseTimestampMs(b) - npsResponseTimestampMs(a);
    if (dt !== 0) return dt;
    return responseSortId(b).localeCompare(responseSortId(a));
  });
  return rows;
}

export function lastTwoNpsArePromoter(validSortedDesc) {
  if (!validSortedDesc || validSortedDesc.length < 2) return false;
  const [latest, previous] = validSortedDesc;
  return latest.score >= 9 && previous.score >= 9;
}

export function isPromotor5Estrelas(validSortedDesc) {
  if (!validSortedDesc || validSortedDesc.length < 2) return false;
  const [latest, previous] = validSortedDesc;
  return latest.score === 10 && previous.score >= 9;
}

export function npsPairLabel(latestScore, previousScore) {
  return `${previousScore} → ${latestScore}`;
}

function cycleLabel(row) {
  return row?.analytical_cycle_code ?? row?.analytical_cycle_name ?? row?.source_cycle_name ?? null;
}

/**
 * Flags de funil (independente de segmentacao).
 */
export function evaluatePromotor5EstrelasFunnel(client, allResponses) {
  const clientId = client?.id ?? client?.client_id;
  const validSorted = validNpsResponsesForClient(allResponses, clientId);
  const latest = validSorted[0] ?? null;
  const previous = validSorted[1] ?? null;
  const hasTwo = validSorted.length >= 2;
  const lastTwoPromoter = lastTwoNpsArePromoter(validSorted);
  const latestIsTen = latest?.score === 10;
  const eligible = isPromotor5Estrelas(validSorted);

  let auditReason = null;
  if (validSorted.length === 0) auditReason = 'no_valid_nps';
  else if (validSorted.length === 1) auditReason = 'single_valid_nps';
  else if (!lastTwoPromoter) auditReason = 'last_two_not_both_promoter';
  else if (!latestIsTen) auditReason = 'latest_not_10';

  return {
    client_id: clientId,
    valid_nps_count: validSorted.length,
    has_two_valid_nps: hasTwo,
    last_two_promoter: lastTwoPromoter,
    latest_score_10: latestIsTen,
    eligible,
    audit_reason: eligible ? null : auditReason,
    latest,
    previous,
    status_normalized: normalizeClientStatus(client?.status),
    is_active_raw: isRawStatusActive(client?.status),
  };
}

export function buildClientMechanismSets(clientMecanismos, catalogById) {
  const byClient = new Map();
  const detailByClient = new Map();
  for (const row of clientMecanismos ?? []) {
    const cid = row.client_id;
    if (!cid) continue;
    const cat = catalogById.get(row.mecanismo_id);
    const label = (cat?.label ?? row.mecanismo_name ?? row.mecanismo_id ?? '').trim();
    if (!label) continue;
    const key = String(row.mecanismo_id ?? label).toLowerCase();
    if (!byClient.has(cid)) byClient.set(cid, new Set());
    byClient.get(cid).add(key);
    if (!detailByClient.has(cid)) detailByClient.set(cid, new Map());
    detailByClient.get(cid).set(key, { label, status: row.status ?? null });
  }
  return { byClient, detailByClient };
}

export function mechanismCountBucket(n) {
  if (n >= 5) return '5+';
  return String(n);
}

function sortEntriesByCountNaLast(entries) {
  const na = NAO_INFORMADO;
  return entries.sort((a, b) => {
    const [la, ca] = a;
    const [lb, cb] = b;
    const aNa = displayLabel(la) === na;
    const bNa = displayLabel(lb) === na;
    if (aNa && !bNa) return 1;
    if (bNa && !aNa) return -1;
    return cb - ca || compareLabelNaLast(la, lb);
  });
}

function topNCounts(map, limit = 10, totalOverride = null) {
  const entries = sortEntriesByCountNaLast([...map.entries()]);
  const total = totalOverride ?? (entries.reduce((s, [, c]) => s + c, 0) || 1);
  return entries.slice(0, limit).map(([label, count]) => ({
    label: displayLabel(label),
    count,
    pct: (count / total) * 100,
  }));
}

/** @deprecated use evaluatePromotor5EstrelasFunnel — mantido para testes legados de import */
export function evaluateClientEligibility(client, allResponses) {
  const ev = evaluatePromotor5EstrelasFunnel(client, allResponses);
  return { ...ev, five_star: ev.eligible, eligible: ev.eligible };
}

export function computeUniverseAudit(clients, responses) {
  const pharus = (clients ?? []).filter((c) => String(c.programa ?? '').toUpperCase() === 'PHARUS');
  let active = 0;
  let with2 = 0;
  let lastTwoProm = 0;
  let latest10 = 0;
  let eligible = 0;
  let eligibleActive = 0;
  const qaSamples = [];
  const negativeChecks = [];

  for (const c of pharus) {
    if (isRawStatusActive(c.status)) active += 1;
    const ev = evaluatePromotor5EstrelasFunnel(c, responses);
    if (ev.has_two_valid_nps) with2 += 1;
    if (ev.last_two_promoter) lastTwoProm += 1;
    if (ev.latest?.score === 10) latest10 += 1;
    if (ev.eligible) {
      eligible += 1;
      if (ev.is_active_raw) eligibleActive += 1;
      if (qaSamples.length < 10) {
        qaSamples.push({
          client_id: ev.client_id,
          previous_score: ev.previous?.score ?? null,
          latest_score: ev.latest?.score ?? null,
          previous_cycle: cycleLabel(ev.previous),
          latest_cycle: cycleLabel(ev.latest),
        });
      }
    }
    if (['last_two_not_both_promoter', 'latest_not_10', 'single_valid_nps'].includes(ev.audit_reason)) {
      if (negativeChecks.length < 20 && ev.latest && ev.previous) {
        negativeChecks.push({
          client_id: ev.client_id,
          pair: npsPairLabel(ev.latest.score, ev.previous.score),
          reason: ev.audit_reason,
        });
      }
    }
  }

  return {
    total_clients: pharus.length,
    active_clients: active,
    clients_with_2_valid_nps: with2,
    last_two_promoters: lastTwoProm,
    latest_score_10: latest10,
    eligible_total: eligible,
    eligible_active: eligibleActive,
    qa_eligible_samples: qaSamples,
    qa_negative_samples: negativeChecks.slice(0, 10),
  };
}

export function buildPromotoresFiveEstrelasPack(input) {
  const { clients = [], responses = [], clientMecanismos = [], mecanismosCatalog = [] } = input;

  const catalogById = new Map(
    (mecanismosCatalog ?? []).map((m) => [
      m.id,
      { id: m.id, label: (m.name ?? m.nome ?? m.codigo ?? m.id ?? '').trim() },
    ]),
  );
  const { byClient: mechSets, detailByClient: mechDetail } = buildClientMechanismSets(
    clientMecanismos,
    catalogById,
  );

  const pharusClients = clients.filter((c) => String(c.programa ?? '').toUpperCase() === 'PHARUS');
  const universe = computeUniverseAudit(pharusClients, responses);
  const eligibleRows = [];

  for (const client of pharusClients) {
    const ev = evaluatePromotor5EstrelasFunnel(client, responses);
    if (!ev.eligible) continue;

    const mechSet = mechSets.get(ev.client_id) ?? new Set();
    const mechLabels = [...(mechDetail.get(ev.client_id)?.values() ?? [])].map((m) => m.label);
    const uf = normalizeBrazilUf(client.estado);
    const region = regionFromUf(uf);

    eligibleRows.push({
      client_id: ev.client_id,
      client_name: client.name ?? '',
      client_code: client.codigo ?? null,
      search_email: client.email ? String(client.email).trim().toLowerCase() : null,
      status: ev.status_normalized,
      programa: client.programa ?? 'PHARUS',
      ep_name: displayLabel(client.engenheiro_patrimonial),
      profession_raw: client.profissao ?? null,
      profession: displayLabel(client.profissao),
      profession_category: classifyProfessionCategory(client.profissao),
      state: uf ? uf : NAO_INFORMADO,
      city: displayLabel(client.cidade),
      region: region ? region : NAO_INFORMADO,
      nps_latest: ev.latest.score,
      nps_previous: ev.previous.score,
      nps_pair: npsPairLabel(ev.latest.score, ev.previous.score),
      nps_latest_at: ev.latest.submitted_at ?? ev.latest.response_date ?? null,
      nps_previous_at: ev.previous.submitted_at ?? ev.previous.response_date ?? null,
      latest_nps_cycle: cycleLabel(ev.latest),
      previous_nps_cycle: cycleLabel(ev.previous),
      nps_latest_category: classifyNpsScore(ev.latest.score),
      nps_previous_category: classifyNpsScore(ev.previous.score),
      mechanism_count: mechSet.size,
      mechanism_bucket: mechanismCountBucket(mechSet.size),
      mechanisms: mechLabels.sort((a, b) => a.localeCompare(b, 'pt-BR')),
      mechanisms_top: mechLabels.slice(0, 3).join(', '),
    });
  }

  let profFilled = 0;
  let stateFilled = 0;
  let cityFilled = 0;
  let mechFilled = 0;
  for (const row of eligibleRows) {
    if (row.profession !== NAO_INFORMADO) profFilled += 1;
    if (row.state !== NAO_INFORMADO) stateFilled += 1;
    if (row.city !== NAO_INFORMADO) cityFilled += 1;
    if (row.mechanism_count > 0) mechFilled += 1;
  }

  const n = eligibleRows.length;
  const avgMech = n ? eligibleRows.reduce((s, r) => s + r.mechanism_count, 0) / n : null;

  return {
    meta: {
      generated_at: new Date().toISOString(),
      rule: PROMOTOR_5_ESTRELAS_RULE,
      nao_informado_label: NAO_INFORMADO,
    },
    universe_audit: universe,
    profile: {
      profession_coverage_pct: n ? (profFilled / n) * 100 : null,
      state_coverage_pct: n ? (stateFilled / n) * 100 : null,
      city_coverage_pct: n ? (cityFilled / n) * 100 : null,
    },
    mechanisms: {
      clients_with_mechanisms: mechFilled,
      clients_with_mechanisms_pct: n ? (mechFilled / n) * 100 : null,
      avg_mechanisms: avgMech,
    },
    clients: eligibleRows,
  };
}

/** KPIs e gráficos a partir do recorte filtrado (frontend). */
export function computePromotoresAnalytics(filteredClients, { activeClientsTotal = 1 } = {}) {
  const rows = filteredClients ?? [];
  const n = rows.length;
  const professionMap = new Map();
  const professionCategoryMap = new Map();
  const stateMap = new Map();
  const regionMap = new Map();
  const epMap = new Map();
  const mechFreq = new Map();
  const mechCountDist = new Map();
  const npsPairDist = new Map();

  for (const row of rows) {
    professionMap.set(row.profession, (professionMap.get(row.profession) ?? 0) + 1);
    const pcat = row.profession_category ?? classifyProfessionCategory(row.profession_raw ?? row.profession);
    professionCategoryMap.set(pcat, (professionCategoryMap.get(pcat) ?? 0) + 1);
    stateMap.set(row.state, (stateMap.get(row.state) ?? 0) + 1);
    regionMap.set(row.region, (regionMap.get(row.region) ?? 0) + 1);
    epMap.set(row.ep_name, (epMap.get(row.ep_name) ?? 0) + 1);
    mechCountDist.set(row.mechanism_bucket, (mechCountDist.get(row.mechanism_bucket) ?? 0) + 1);
    npsPairDist.set(row.nps_pair, (npsPairDist.get(row.nps_pair) ?? 0) + 1);
    for (const m of row.mechanisms ?? []) {
      mechFreq.set(m, (mechFreq.get(m) ?? 0) + 1);
    }
  }

  const meanScore = n ? rows.reduce((s, r) => s + r.nps_latest, 0) / n : null;
  const avgMech = n ? rows.reduce((s, r) => s + r.mechanism_count, 0) / n : null;
  const pct3 = n ? (rows.filter((r) => r.mechanism_count >= 3).length / n) * 100 : null;

  const npsGroup = aggregateNpsFromResponses(
    rows.map((r) => ({ client_id: r.client_id, score: r.nps_latest })),
    { dedupe: false, requireClientId: true },
  );

  return {
    kpis: {
      eligible_clients: n,
      pct_of_active_base: activeClientsTotal ? (n / activeClientsTotal) * 100 : null,
      mean_score_latest: meanScore,
      group_nps: npsGroup.nps,
      mean_mechanism_count: avgMech,
      pct_with_3_plus_mechanisms: pct3,
      top_profession: topNCounts(professionMap, 1, n)[0]?.label ?? NAO_INFORMADO,
      top_state: topNCounts(stateMap, 1, n)[0]?.label ?? NAO_INFORMADO,
    },
    charts: {
      professions: topNCounts(professionMap, 10, n),
      profession_categories: rollupProfessionCategoriesForPie(professionCategoryMap, 8),
      profession_categories_full: topNCounts(professionCategoryMap, 20, n),
      states: topNCounts(stateMap, 15, n),
      regions: topNCounts(regionMap, 6, n),
      mechanisms: topNCounts(mechFreq, 10, n).map((r) => ({
        ...r,
        pct_of_eligible: n ? (r.count / n) * 100 : 0,
      })),
      mechanism_count_buckets: ['0', '1', '2', '3', '4', '5+'].map((b) => ({
        bucket: b,
        count: mechCountDist.get(b) ?? 0,
        pct: n ? ((mechCountDist.get(b) ?? 0) / n) * 100 : 0,
      })),
      nps_pairs: topNCounts(npsPairDist, 10, n),
      eps: topNCounts(epMap, 15, n).map((r) => ({ ep: r.label, count: r.count, pct: r.pct })),
    },
  };
}

export { NAO_INFORMADO };
