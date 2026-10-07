import { isSafrasPeriodSpecific, historyMatchesSafrasNpsPeriod } from './safras-nps-period.mjs';
import { canonicalizeNpsCycle } from '../utils/nps-cycle-labels.mjs';
import { cycleSortKey } from '../utils/cycle-sort.mjs';

export function defaultSafrasFilters() {
  return {
    npsPeriod: 'all',
    carteira: 'active',
    safra: '',
    programa: '',
    ep: '',
    app: 'all',
    answered: 'all',
    categoria: '',
    minResponses: '',
  };
}

/** Heurística de exclusão (cohort tem cliente_ativo oficial; motivo detalhado via status). */
export function classifyInactiveBucket(customer) {
  if (customer.cliente_ativo === true) return null;
  const st = String(customer.status_cliente ?? '').toLowerCase();
  if (st.includes('congel')) return 'congelado';
  if (st.includes('churn') || st.includes('cancel')) return 'cancelado';
  return 'outros';
}

export function computeCarteiraAudit(customers) {
  const total_all = customers.length;
  const total_active = customers.filter((c) => c.cliente_ativo === true).length;
  const total_excluded = total_all - total_active;
  let cancelado = 0;
  let congelado = 0;
  let outros = 0;
  for (const c of customers) {
    if (c.cliente_ativo === true) continue;
    const b = classifyInactiveBucket(c);
    if (b === 'cancelado') cancelado += 1;
    else if (b === 'congelado') congelado += 1;
    else outros += 1;
  }
  return { total_all, total_active, total_excluded, cancelado, congelado, outros };
}

/** Enriquece clientes com métricas do período NPS selecionado (view-layer; datasets intactos). */
export function enrichCustomersForNpsPeriod(customers, history, npsPeriod) {
  if (!isSafrasPeriodSpecific(npsPeriod)) return customers ?? [];

  const byClient = new Map();
  for (const h of history ?? []) {
    if (!historyMatchesSafrasNpsPeriod(h, npsPeriod)) continue;
    if (h.nota_nps == null) continue;
    if (!byClient.has(h.client_id)) byClient.set(h.client_id, []);
    byClient.get(h.client_id).push(h);
  }

  return (customers ?? []).map((c) => {
    const rows = (byClient.get(c.client_id) ?? []).sort((a, b) =>
      String(a.data_resposta ?? '').localeCompare(String(b.data_resposta ?? '')),
    );
    const last = rows[rows.length - 1];
    const answered = rows.length > 0;
    return {
      ...c,
      answered_selected_period: answered,
      period_nps_score: last?.nota_nps ?? null,
      period_nps_category: last?.categoria ?? null,
      period_response_count: rows.length,
      period_last_ciclo: last?.ciclo ?? null,
    };
  });
}

function customerAnsweredForFilter(c, filters) {
  if (isSafrasPeriodSpecific(filters.npsPeriod)) {
    if (filters.answered === 'yes') return c.answered_selected_period === true;
    if (filters.answered === 'no') return !c.answered_selected_period;
    return true;
  }
  if (filters.answered === 'yes') return c.ever_answered_nps;
  if (filters.answered === 'no') return c.never_answered_nps;
  return true;
}

export function applySafrasFilters(customers, filters) {
  let rows = customers ?? [];
  const carteira = filters.carteira ?? 'active';
  if (carteira === 'active') {
    rows = rows.filter((r) => r.cliente_ativo === true);
  }
  if (filters.safra) rows = rows.filter((r) => r.safra_trimestre === filters.safra);
  if (filters.programa) rows = rows.filter((r) => (r.programa ?? '').toUpperCase() === filters.programa.toUpperCase());
  if (filters.ep) rows = rows.filter((r) => r.ep === filters.ep);
  if (filters.app === 'yes') rows = rows.filter((r) => r.has_app === true || r.has_app_access === true);
  if (filters.app === 'no') {
    rows = rows.filter(
      (r) =>
        (r.has_app === false || r.has_app_access === false) &&
        (r.app_match_status === 'unmatched' || r.app_match_status === 'not_found'),
    );
  }
  if (filters.app === 'unknown') {
    rows = rows.filter((r) =>
      ['ambiguous', 'insufficient_identifiers'].includes(r.app_match_status),
    );
  }
  rows = rows.filter((r) => customerAnsweredForFilter(r, filters));
  if (filters.categoria) {
    rows = rows.filter((r) => {
      const cat = isSafrasPeriodSpecific(filters.npsPeriod)
        ? r.period_nps_category
        : r.last_nps_category;
      return cat === filters.categoria;
    });
  }
  if (filters.minResponses) {
    const n = Number(filters.minResponses);
    if (Number.isFinite(n)) {
      rows = rows.filter((r) => {
        const count = isSafrasPeriodSpecific(filters.npsPeriod)
          ? (r.period_response_count ?? 0)
          : (r.nps_response_count ?? 0);
        return count >= n;
      });
    }
  }
  return rows;
}

export function computeSafrasKpis(customers, { npsPeriod = 'all' } = {}) {
  const periodSpecific = isSafrasPeriodSpecific(npsPeriod);
  const n = customers.length;
  const answered = customers.filter((c) =>
    periodSpecific ? c.answered_selected_period : c.ever_answered_nps,
  ).length;
  const never = n - answered;
  const appYes = customers.filter((c) => c.has_app_access === true).length;
  const appNo = customers.filter(
    (c) => c.has_app_access === false && c.app_match_status === 'unmatched',
  ).length;
  const appAndAnswered = customers.filter((c) =>
    periodSpecific
      ? c.has_app_access === true && c.answered_selected_period
      : c.has_app_access === true && c.ever_answered_nps,
  ).length;
  const scores = customers
    .map((c) => (periodSpecific ? c.period_nps_score : c.last_nps_score))
    .filter((s) => s != null);
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  const nps =
    scores.length > 0 ? Math.round(((100 * prom - 100 * det) / scores.length) * 10) / 10 : null;
  const days = customers.map((c) => c.days_entry_to_first_nps_valid).filter((d) => d != null);
  days.sort((a, b) => a - b);
  const medianDays = days.length ? days[Math.floor(days.length / 2)] : null;
  return {
    clients: n,
    answered,
    pctAnswered: n ? Math.round((1000 * answered) / n) / 10 : null,
    never,
    pctNever: n ? Math.round((1000 * never) / n) / 10 : null,
    appYes,
    pctApp: n ? Math.round((1000 * appYes) / n) / 10 : null,
    appNo,
    pctNoApp: n ? Math.round((1000 * appNo) / n) / 10 : null,
    appAndAnswered,
    pctAppAnswered: appYes ? Math.round((1000 * appAndAnswered) / appYes) / 10 : null,
    nps,
    medianDays,
  };
}

function npsFromCustomerScores(customers, periodSpecific) {
  const scores = customers
    .map((c) => (periodSpecific ? c.period_nps_score : c.last_nps_score))
    .filter((s) => s != null);
  if (!scores.length) return { nps: null, n: 0 };
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return {
    n: scores.length,
    nps: Math.round(((100 * prom - 100 * det) / scores.length) * 10) / 10,
  };
}

function responseRateForGroup(customers, periodSpecific) {
  const n = customers.length;
  const answered = customers.filter((c) =>
    periodSpecific ? c.answered_selected_period : c.ever_answered_nps,
  ).length;
  return {
    n,
    answered,
    pctAnswered: n ? Math.round((1000 * answered) / n) / 10 : null,
  };
}

/** NPS e taxa de resposta — com App vs sem App (não causal). */
export function computeNpsByApp(customers, { npsPeriod = 'all' } = {}) {
  const periodSpecific = isSafrasPeriodSpecific(npsPeriod);
  const withApp = customers.filter((c) => c.has_app_access === true);
  const withoutApp = customers.filter(
    (c) => c.has_app_access === false && c.app_match_status === 'unmatched',
  );
  return {
    withApp: {
      ...npsFromCustomerScores(withApp, periodSpecific),
      ...responseRateForGroup(withApp, periodSpecific),
    },
    withoutApp: {
      ...npsFromCustomerScores(withoutApp, periodSpecific),
      ...responseRateForGroup(withoutApp, periodSpecific),
    },
  };
}

export function enrichCoverageRowsWithApp(rows, customers) {
  return (rows ?? []).map((row) => {
    const safra = row.safra_trimestre ?? 'Não informado';
    const inSafra = customers.filter(
      (c) => (c.safra_trimestre ?? 'Não informado') === safra,
    );
    const withApp = inSafra.filter((c) => c.has_app_access === true).length;
    const total = inSafra.length;
    return {
      ...row,
      pct_with_app: total ? Math.round((1000 * withApp) / total) / 10 : null,
    };
  });
}

const SAFRA_MATRIX_EXCLUDE = new Set(['Não informado', 'Nao informado']);

function isValidSafraLabel(s) {
  if (!s || SAFRA_MATRIX_EXCLUDE.has(s)) return false;
  if (/^202[7-9]|^20[3-9]\d/.test(s)) return false;
  return /^\d{4}-Q[1-4]$/.test(s);
}

export function safraOptions(customers, { matrixOnly = false } = {}) {
  const set = new Set(customers.map((c) => c.safra_trimestre).filter(Boolean));
  let list = [...set];
  if (matrixOnly) list = list.filter(isValidSafraLabel);
  return list.sort((a, b) => a.localeCompare(b));
}

export function epOptions(customers) {
  return [...new Set(customers.map((c) => c.ep).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
}

export function buildSafraMedicaoPivot(history, customers, metric = 'nps', npsPeriod = 'all') {
  const custMap = new Map(customers.map((c) => [c.client_id, c]));
  const safras = safraOptions(customers, { matrixOnly: true });
  const hist = (history ?? []).filter((h) => historyMatchesSafrasNpsPeriod(h, npsPeriod));
  const cells = {};
  for (const h of hist) {
    const safra = custMap.get(h.client_id)?.safra_trimestre ?? 'Não informado';
    const cicloCanon = canonicalizeNpsCycle(h.ciclo);
    const key = `${safra}||${cicloCanon}`;
    if (!cells[key]) cells[key] = [];
    if (h.nota_nps != null) cells[key].push(h.nota_nps);
  }
  const ciclos = [...new Set(hist.map((h) => canonicalizeNpsCycle(h.ciclo)).filter(Boolean))].sort(
    (a, b) => cycleSortKey(a) - cycleSortKey(b),
  );
  return { safras, ciclos, cells, metric };
}

export function getSafraCoverageRows(_summaries, customers, _history, npsPeriod, safraFilter) {
  const periodSpecific = isSafrasPeriodSpecific(npsPeriod);
  const safraSet = new Set(customers.map((c) => c.safra_trimestre).filter(Boolean));
  if (customers.some((c) => !c.safra_trimestre)) safraSet.add('Não informado');

  const rows = [];
  for (const safra of [...safraSet].sort((a, b) => a.localeCompare(b))) {
    if (safraFilter && safra !== safraFilter) continue;
    const inSafra = customers.filter(
      (c) => (c.safra_trimestre ?? 'Não informado') === safra,
    );
    const total = inSafra.length;
    const responderam = periodSpecific
      ? inSafra.filter((c) => c.answered_selected_period).length
      : inSafra.filter((c) => c.ever_answered_nps).length;
    const scores = periodSpecific
      ? inSafra
          .filter((c) => c.answered_selected_period && c.period_nps_score != null)
          .map((c) => c.period_nps_score)
      : inSafra.filter((c) => c.last_nps_score != null).map((c) => c.last_nps_score);
    rows.push({
      safra_trimestre: safra,
      clientes_total: total,
      clientes_que_responderam: responderam,
      pct_que_ja_responderam: total ? Math.round((1000 * responderam) / total) / 10 : 0,
      nps_atual: cellMetric(scores, 'nps'),
      nota_media: cellMetric(scores, 'nota_media'),
    });
  }
  return rows;
}

export function cellMetric(scores, metric) {
  if (!scores?.length) return null;
  if (metric === 'respostas') return scores.length;
  if (metric === 'nota_media') return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return Math.round(((100 * prom - 100 * det) / scores.length) * 10) / 10;
}
