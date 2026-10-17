import { calculateNpsSummary, isValidScore } from '../../../lib/analytics/nps.mjs';

export const COHORT_NO_ENTRY = '__no_entry__';
export const COHORT_NO_ENTRY_LABEL = 'Sem data de entrada';
export const ENTRY_YEAR_2025_PLUS = '2025+';
export const ENTRY_YEAR_ALL = '__all__';
export const ENTRY_YEAR_NO_DATE = '__no_date__';

export const HISTORICO2_STICKY_KEY = 'analytics-nps:historico2-sticky-filters';

export function historico2StickyEnabled() {
  try {
    const saved = sessionStorage.getItem(HISTORICO2_STICKY_KEY);
    if (saved === null) return true;
    return saved === '1';
  } catch {
    return true;
  }
}

export function setHistorico2StickyEnabled(enabled) {
  try {
    sessionStorage.setItem(HISTORICO2_STICKY_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function defaultHistorico2Filters() {
  return {
    cohort: '',
    program: '',
    ep: '',
    npsCategory: '',
    status: '',
    entryYear: ENTRY_YEAR_ALL,
    hasEntryDate: '',
    matchMethod: '',
    search: '',
  };
}

/** Filtros que recortam KPIs oficiais do ciclo (safra 2025+ sozinha não recorta). */
export function hasExplicitHistorico2Filters(filters) {
  return Boolean(
    filters?.cohort ||
      filters?.program ||
      filters?.ep ||
      filters?.npsCategory ||
      filters?.status ||
      (filters?.entryYear && filters.entryYear !== ENTRY_YEAR_ALL) ||
      filters?.hasEntryDate ||
      filters?.matchMethod ||
      filters?.search?.trim(),
  );
}

export function displaySafra(client) {
  if (!client?.entry_date) return COHORT_NO_ENTRY_LABEL;
  return client.entry_cohort ?? COHORT_NO_ENTRY_LABEL;
}

export function cohortSort(a, b) {
  if (a === COHORT_NO_ENTRY_LABEL) return 1;
  if (b === COHORT_NO_ENTRY_LABEL) return -1;
  return String(a).localeCompare(String(b));
}

export function isSafra2025Plus(cohortLabel) {
  if (!cohortLabel || cohortLabel === COHORT_NO_ENTRY_LABEL) return false;
  const y = Number(String(cohortLabel).slice(0, 4));
  return Number.isFinite(y) && y >= 2025;
}

function passesEntryYear(c, entryYear) {
  if (!entryYear || entryYear === ENTRY_YEAR_ALL) return true;
  if (entryYear === ENTRY_YEAR_NO_DATE) return !c.entry_date;
  if (entryYear === ENTRY_YEAR_2025_PLUS) {
    if (!c.entry_date) return true;
    const y = Number(c.entry_year);
    return Number.isFinite(y) && y >= 2025;
  }
  return String(c.entry_year ?? '') === entryYear;
}

function passesHasEntryDate(c, hasEntryDate) {
  if (!hasEntryDate) return true;
  if (hasEntryDate === 'yes') return Boolean(c.entry_date);
  if (hasEntryDate === 'no') return !c.entry_date;
  return true;
}

function passesMatchMethod(c, matchMethod) {
  if (!matchMethod) return true;
  if (matchMethod === 'unmatched') return c.entry_date_match_method === 'unmatched';
  if (matchMethod === 'ambiguous') return c.entry_date_match_method === 'ambiguous';
  return c.entry_date_match_method === matchMethod;
}

export function clientDisplayName(client) {
  return (client?.name ?? client?.name_display ?? '—').trim();
}

export function filterHistorico2Clients(clients, filters) {
  const q = (filters.search ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return (clients ?? []).filter((c) => {
    const safra = displaySafra(c);
    if (filters.cohort) {
      if (filters.cohort === COHORT_NO_ENTRY) {
        if (c.entry_date) return false;
      } else if (safra !== filters.cohort) return false;
    }
    if (filters.program && (c.program ?? '') !== filters.program) return false;
    if (filters.ep && (c.ep ?? '') !== filters.ep) return false;
    if (filters.status && (c.status ?? '') !== filters.status) return false;
    if (filters.npsCategory && (c.nps_category ?? '') !== filters.npsCategory) return false;
    if (!passesEntryYear(c, filters.entryYear)) return false;
    if (!passesHasEntryDate(c, filters.hasEntryDate)) return false;
    if (!passesMatchMethod(c, filters.matchMethod)) return false;
    if (q) {
      const hay = `${clientDisplayName(c)} ${c.client_id ?? ''} ${c.client_email ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function aggregateNpsScores(scores) {
  if (!scores.length) {
    return {
      nps: null,
      promoters: 0,
      neutrals: 0,
      detractors: 0,
      promoter_pct: null,
      neutral_pct: null,
      detractor_pct: null,
      average_score: null,
      nps_responses: 0,
    };
  }
  const summary = calculateNpsSummary(scores.map((score) => ({ score })));
  const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  return {
    nps: summary.nps,
    promoters: summary.promoters,
    neutrals: summary.passives,
    detractors: summary.detractors,
    promoter_pct: summary.promoterPct,
    neutral_pct: summary.passivePct,
    detractor_pct: summary.detractorPct,
    average_score: avg,
    nps_responses: scores.length,
  };
}

function buildCohortSummaries(clients, { chartsFrom2025 = true } = {}) {
  const map = new Map();
  for (const c of clients) {
    if (!c.entry_date) continue;
    const key = c.entry_cohort;
    if (!key) continue;
    if (chartsFrom2025 && !isSafra2025Plus(key)) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return [...map.entries()]
    .map(([entry_cohort, rows]) => ({
      entry_cohort,
      clients: rows.length,
      ...aggregateNpsScores(
        rows.filter((r) => r.nps_score != null && isValidScore(r.nps_score)).map((r) => r.nps_score),
      ),
    }))
    .sort((a, b) => cohortSort(a.entry_cohort, b.entry_cohort));
}

function buildDimensionTable(clients, field) {
  const map = new Map();
  for (const c of clients) {
    const key = c[field] ?? 'Não informado';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return [...map.entries()]
    .map(([label, rows]) => {
      const scores = rows.filter((r) => r.nps_score != null && isValidScore(r.nps_score)).map((r) => r.nps_score);
      const agg = aggregateNpsScores(scores);
      return {
        label,
        clients: rows.length,
        nps_responses: agg.nps_responses,
        nps: agg.nps,
        average_score: agg.average_score,
      };
    })
    .sort((a, b) => b.clients - a.clients);
}

function countByMethod(clients) {
  const by = {
    base_qv_id: 0,
    cpf: 0,
    email: 0,
    phone: 0,
    unmatched: 0,
    ambiguous: 0,
  };
  for (const c of clients) {
    const m = c.entry_date_match_method;
    if (m && by[m] != null) by[m] += 1;
  }
  return by;
}

/** KPIs + agregações derivadas do mesmo recorte filtrado. */
export function buildHistorico2ViewModel(clients) {
  const total = clients.length;
  const withEntry = clients.filter((c) => c.entry_date).length;
  const withoutEntry = total - withEntry;
  const coverage = total > 0 ? Math.round((withEntry / total) * 1000) / 10 : null;
  const npsResponses = clients.filter((c) => c.nps_score != null && isValidScore(c.nps_score)).length;
  const cohorts2025 = new Set(
    clients.filter((c) => c.entry_cohort && isSafra2025Plus(c.entry_cohort)).map((c) => c.entry_cohort),
  );

  const allScores = clients
    .filter((c) => c.nps_score != null && isValidScore(c.nps_score))
    .map((c) => c.nps_score);
  const overallNps = aggregateNpsScores(allScores).nps;

  return {
    kpis: {
      clients_analyzed: total,
      clients_with_entry_date: withEntry,
      clients_without_entry_date: withoutEntry,
      match_coverage_pct: coverage,
      nps_responses_considered: npsResponses,
      distinct_entry_cohorts_2025_plus: cohorts2025.size,
    },
    matchQuality: countByMethod(clients),
    cohortSummaries: buildCohortSummaries(clients, { chartsFrom2025: true }),
    programTable: buildDimensionTable(clients, 'program'),
    epTable: buildDimensionTable(clients, 'ep'),
    overallNps,
  };
}

export function distinctOptions(clients, field, { excludeEmpty = false } = {}) {
  const set = new Set();
  for (const c of clients ?? []) {
    const v = c[field];
    if (v == null || v === '') {
      if (!excludeEmpty) set.add('');
      continue;
    }
    set.add(String(v));
  }
  return [...set].sort((a, b) => String(a).localeCompare(String(b)));
}

export function safraFilterOptions(clients) {
  const set = new Set();
  let hasNoEntry = false;
  for (const c of clients) {
    if (!c.entry_date) hasNoEntry = true;
    else if (c.entry_cohort) set.add(c.entry_cohort);
  }
  const list = [...set].sort(cohortSort);
  return { safras: list, hasNoEntry };
}

export function filterChipList(filters) {
  const chips = [];
  const push = (key, label, value) => {
    if (!value) return;
    chips.push({ key, label, value });
  };
  push('cohort', 'Safra', filters.cohort === COHORT_NO_ENTRY ? COHORT_NO_ENTRY_LABEL : filters.cohort);
  push('program', 'Programa', filters.program);
  push('ep', 'EP', filters.ep);
  push('npsCategory', 'Categoria', filters.npsCategory);
  push('status', 'Status', filters.status);
  if (filters.entryYear && filters.entryYear !== ENTRY_YEAR_ALL) {
    const labels = {
      [ENTRY_YEAR_ALL]: 'Todos os anos',
      [ENTRY_YEAR_NO_DATE]: 'Sem data de entrada',
      [ENTRY_YEAR_2025_PLUS]: '2025+',
    };
    push('entryYear', 'Ano entrada', labels[filters.entryYear] ?? filters.entryYear);
  }
  if (filters.hasEntryDate === 'yes') push('hasEntryDate', 'Com data entrada', 'Sim');
  if (filters.hasEntryDate === 'no') push('hasEntryDate', 'Com data entrada', 'Não');
  if (filters.matchMethod) push('matchMethod', 'Match', filters.matchMethod);
  if (filters.search?.trim()) push('search', 'Busca', filters.search.trim());
  return chips;
}

export function sortClients(clients, sortKey, sortDir) {
  const dir = sortDir === 'desc' ? -1 : 1;
  const copy = [...clients];
  const val = (c) => {
    switch (sortKey) {
      case 'name':
        return clientDisplayName(c).toLowerCase();
      case 'entry_date':
        return c.entry_date ?? '';
      case 'safra':
        return displaySafra(c);
      case 'nps_score':
        return c.nps_score ?? -1;
      case 'nps_submitted_at':
        return c.nps_submitted_at ?? '';
      default:
        return '';
    }
  };
  copy.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return copy;
}
