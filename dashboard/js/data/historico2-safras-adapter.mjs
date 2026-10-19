import { isValidScore } from '../../../lib/analytics/nps.mjs';
import { expandPharusMatchEntry } from '../../../lib/analytics/pharus-app-match.mjs';
import { buildCohortSummaries } from './historico2-view.mjs';
import { isPharusAppMatchAvailable } from './pharus-app-availability.mjs';

/**
 * BASE QV (atributos + NPS) + entry_date/safra do pipeline Histórico 2 (BASE0 só data_entrada).
 */
export function mapHistorico2ClientToSafrasRow(c) {
  const safra = c.entry_cohort ?? null;
  const hasNps = c.nps_score != null && isValidScore(Number(c.nps_score));
  const fullName = (c.name ?? c.name_display ?? '—').trim();
  return {
    client_id: c.client_id,
    client_name: fullName,
    client_email: c.client_email ?? null,
    programa: c.program ?? '—',
    ep: c.ep ?? '—',
    status_cliente: c.status ?? '—',
    data_entrada: c.entry_date ?? null,
    safra_trimestre: safra ?? 'Sem data',
    entry_date_match_method: c.entry_date_match_method ?? c.match_method_label ?? null,
    cliente_ativo: !String(c.status ?? '')
      .toLowerCase()
      .match(/cancel|churn/),
    last_nps_score: hasNps ? c.nps_score : null,
    last_nps_category: hasNps ? c.nps_category : null,
    nps_submitted_at: c.nps_submitted_at ?? null,
    nps_response_count: hasNps ? 1 : 0,
    ever_answered_nps: hasNps,
    never_answered_nps: !hasNps,
    has_app_access: null,
    app_match: null,
    app_match_status: null,
    app_match_method: null,
    attributes_source: c.attributes_source ?? 'base_qv',
    entry_date_source: c.entry_date ? 'base0.data_entrada' : null,
    _historico2: true,
  };
}

export function safrasCustomersFromHistorico2(historico2Doc) {
  return (historico2Doc?.clients ?? []).map(mapHistorico2ClientToSafrasRow);
}

function parseDay(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Histórico NPS (BASE QV) enriquece contagem, média, 1º NPS e ciclo. */
export function enrichSafrasRowsWithNpsHistory(customers, historyRows) {
  const byClient = new Map();
  for (const h of historyRows ?? []) {
    if (h.nota_nps == null || !isValidScore(Number(h.nota_nps))) continue;
    if (!byClient.has(h.client_id)) byClient.set(h.client_id, []);
    byClient.get(h.client_id).push(h);
  }

  return (customers ?? []).map((c) => {
    const rows = (byClient.get(c.client_id) ?? []).sort((a, b) =>
      String(a.data_resposta ?? '').localeCompare(String(b.data_resposta ?? '')),
    );
    const scores = rows.map((r) => Number(r.nota_nps));
    const last = rows[rows.length - 1];
    const first = rows[0];
    let days_entry_to_first_nps_valid = null;
    const entryTs = parseDay(c.data_entrada);
    const firstTs = parseDay(first?.data_resposta);
    if (entryTs != null && firstTs != null && firstTs >= entryTs) {
      days_entry_to_first_nps_valid = Math.floor((firstTs - entryTs) / 86400000);
    }

    const count = rows.length;
    const avg =
      count >= 2 ? Math.round((scores.reduce((a, b) => a + b, 0) / count) * 10) / 10 : null;

    return {
      ...c,
      nps_response_count: count,
      ever_answered_nps: count > 0,
      never_answered_nps: count === 0,
      last_nps_score: last?.nota_nps ?? c.last_nps_score,
      last_nps_category: last?.categoria ?? c.last_nps_category,
      last_nps_cycle: last?.ciclo ?? c.last_nps_cycle ?? null,
      avg_nps_score: avg,
      days_entry_to_first_nps_valid,
    };
  });
}

/** Mesmo kernel que NPS Histórico (`buildCohortSummaries`). */
export function buildSafrasCohortSummariesFromHistorico2Clients(h2Clients, opts = {}) {
  return buildCohortSummaries(h2Clients ?? [], {
    chartsFrom2025: opts.minYear == null || opts.minYear >= 2025,
  });
}

/** @deprecated use buildSafrasCohortSummariesFromHistorico2Clients com clientes Histórico 2 brutos */
export function npsBySafraFromHistorico2Clients(mappedCustomers, opts = {}) {
  const pseudo = (mappedCustomers ?? []).map((c) => ({
    entry_date: c.data_entrada,
    entry_cohort: c.safra_trimestre === 'Sem data' ? null : c.safra_trimestre,
    nps_score: c.last_nps_score,
  }));
  return buildCohortSummaries(pseudo, { chartsFrom2025: opts.minYear == null || opts.minYear >= 2025 });
}

export function historico2ClientsForSafrasCohort(h2Clients, filteredSafrasRows) {
  const ids = new Set((filteredSafrasRows ?? []).map((r) => r.client_id));
  return (h2Clients ?? []).filter((c) => ids.has(c.client_id));
}

/** Aplica artifact `pharus_app_customer_match.json` (sem PII) às linhas Safras. */
export function enrichSafrasRowsWithPharusAppMatch(customers, matchDoc) {
  const byId = new Map((matchDoc?.entries ?? []).map((e) => [e.client_id, e]));
  return (customers ?? []).map((row) => {
    const expanded = expandPharusMatchEntry(byId.get(row.client_id));
    return { ...row, ...expanded };
  });
}

export function isSafrasAppUnavailableUsingHistorico2(historico2Doc, safrasAudit, pharusMatchDoc, pharusAudit) {
  if (isPharusAppMatchAvailable(pharusMatchDoc, pharusAudit)) return false;
  if ((safrasAudit?.app_clients_matched ?? 0) > 0) return false;
  return Boolean(historico2Doc?.clients?.length);
}
