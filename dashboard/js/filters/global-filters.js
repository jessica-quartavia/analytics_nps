const DEFAULT = {
  cycleCode: null,
  npsPeriod: 'all',
  ep: '',
  category: '',
  scoreMin: '',
  scoreMax: '',
  deltaMin: '',
  deltaMax: '',
  base: 'total',
  migrationCell: '',
  priority: '',
  search: '',
  withPreviousOnly: false,
  topic: '',
  valence: '',
  vocSort: 'volume',
  vocMatrixTopic: '',
  vocMatrixValence: '',
  hasCsat: '',
};

let filters = { ...DEFAULT };
const listeners = new Set();

export function getFilters() {
  return { ...filters };
}

export function setFilter(key, value) {
  filters = { ...filters, [key]: value };
  if (key === 'cycleCode') {
    filters.migrationCell = '';
    filters.priority = '';
  }
  notify();
}

export function resetFiltersExceptCycle() {
  const cycleCode = filters.cycleCode;
  filters = { ...DEFAULT, cycleCode };
  notify();
}

export function setFilters(partial) {
  filters = { ...filters, ...partial };
  notify();
}

export function subscribeFilters(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(getFilters());
}

export function initDefaultCycle(latestCycleCode) {
  if (!filters.cycleCode && latestCycleCode) {
    filters.cycleCode = latestCycleCode;
  }
}

export function getEpOptions(responses) {
  const set = new Set();
  for (const r of responses) {
    if (r.ep_name) set.add(r.ep_name);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
