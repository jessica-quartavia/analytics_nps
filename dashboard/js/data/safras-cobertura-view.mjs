export function defaultSafrasFilters() {
  return {
    safra: '',
    programa: '',
    ep: '',
    app: 'all',
    answered: 'all',
    categoria: '',
    minResponses: '',
  };
}

export function applySafrasFilters(customers, filters) {
  let rows = customers ?? [];
  if (filters.safra) rows = rows.filter((r) => r.safra_trimestre === filters.safra);
  if (filters.programa) rows = rows.filter((r) => (r.programa ?? '').toUpperCase() === filters.programa.toUpperCase());
  if (filters.ep) rows = rows.filter((r) => r.ep === filters.ep);
  if (filters.app === 'yes') rows = rows.filter((r) => r.has_app_access === true);
  if (filters.app === 'no') rows = rows.filter((r) => r.has_app_access === false);
  if (filters.app === 'unknown') rows = rows.filter((r) => r.has_app_access == null);
  if (filters.answered === 'yes') rows = rows.filter((r) => r.ever_answered_nps);
  if (filters.answered === 'no') rows = rows.filter((r) => r.never_answered_nps);
  if (filters.categoria) rows = rows.filter((r) => r.last_nps_category === filters.categoria);
  if (filters.minResponses) {
    const n = Number(filters.minResponses);
    if (Number.isFinite(n)) rows = rows.filter((r) => (r.nps_response_count ?? 0) >= n);
  }
  return rows;
}

export function computeSafrasKpis(customers) {
  const n = customers.length;
  const answered = customers.filter((c) => c.ever_answered_nps).length;
  const never = n - answered;
  const appYes = customers.filter((c) => c.has_app_access === true).length;
  const appAndAnswered = customers.filter((c) => c.has_app_access === true && c.ever_answered_nps).length;
  const scores = customers.map((c) => c.last_nps_score).filter((s) => s != null);
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
    appAndAnswered,
    pctAppAnswered: appYes ? Math.round((1000 * appAndAnswered) / appYes) / 10 : null,
    nps,
    medianDays,
  };
}

export function safraOptions(customers) {
  const set = new Set(customers.map((c) => c.safra_trimestre).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function epOptions(customers) {
  return [...new Set(customers.map((c) => c.ep).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
}

export function buildSafraMedicaoPivot(history, customers, metric = 'nps') {
  const custMap = new Map(customers.map((c) => [c.client_id, c]));
  const safras = safraOptions(customers);
  const ciclos = [...new Set(history.map((h) => h.ciclo).filter(Boolean))].sort();
  const cells = {};
  for (const h of history) {
    const safra = custMap.get(h.client_id)?.safra_trimestre ?? 'Não informado';
    const key = `${safra}||${h.ciclo}`;
    if (!cells[key]) cells[key] = [];
    if (h.nota_nps != null) cells[key].push(h.nota_nps);
  }
  return { safras, ciclos, cells, metric };
}

export function cellMetric(scores, metric) {
  if (!scores?.length) return null;
  if (metric === 'respostas') return scores.length;
  if (metric === 'nota_media') return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return Math.round(((100 * prom - 100 * det) / scores.length) * 10) / 10;
}
