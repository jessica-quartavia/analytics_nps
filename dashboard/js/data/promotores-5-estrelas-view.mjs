import { NAO_INFORMADO, compareLabelNaLast } from '../../../lib/analytics/promotores-5-estrelas.mjs';
import { PROFESSION_CATEGORIES, classifyProfessionCategory } from '../../../lib/analytics/profession-category.mjs';

export function defaultPromotoresFilters() {
  return {
    status: 'Ativo',
    programa: 'all',
    ep: 'all',
    state: 'all',
    region: 'all',
    professionCategory: 'all',
    profession: 'all',
    mechanism: 'all',
    mechanismCount: 'all',
    q: '',
  };
}

export function professionCategoryFilterOptions() {
  return PROFESSION_CATEGORIES;
}

function matchSearch(row, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return (
    String(row.client_name ?? '').toLowerCase().includes(needle) ||
    String(row.client_id ?? '').toLowerCase().includes(needle) ||
    String(row.search_email ?? '').includes(needle)
  );
}

export function applyInternalAnalysisFilters(rows, filters) {
  return (rows ?? []).filter((r) => {
    if (filters.status && filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.programa !== 'all' && r.programa !== filters.programa) return false;
    if (filters.ep !== 'all' && r.ep_name !== filters.ep) return false;
    if (filters.state !== 'all' && r.state !== filters.state) return false;
    if (filters.region !== 'all' && r.region !== filters.region) return false;
    if (filters.professionCategory !== 'all') {
      const rowCat =
        r.profession_category ?? classifyProfessionCategory(r.profession_raw ?? r.profession);
      if (rowCat !== filters.professionCategory) return false;
    }
    if (filters.profession !== 'all' && r.profession !== filters.profession) return false;
    if (filters.mechanism !== 'all' && !(r.mechanisms ?? []).includes(filters.mechanism)) return false;
    if (filters.mechanismCount !== 'all' && r.mechanism_bucket !== filters.mechanismCount) return false;
    if (!matchSearch(r, filters.q)) return false;
    return true;
  });
}

export function filterOptions(rows, field) {
  const set = new Set((rows ?? []).map((r) => r[field]).filter(Boolean));
  return [...set].sort(compareLabelNaLast);
}

export function statusOptionsFromRows(rows) {
  const set = new Set((rows ?? []).map((r) => r.status).filter(Boolean));
  return [...set].sort(compareLabelNaLast);
}

export function mechanismOptions(rows) {
  const set = new Set();
  for (const r of rows ?? []) {
    for (const m of r.mechanisms ?? []) set.add(m);
  }
  return [...set].sort(compareLabelNaLast);
}

export { NAO_INFORMADO };
