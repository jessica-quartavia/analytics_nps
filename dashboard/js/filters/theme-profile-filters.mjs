const STORAGE_KEY = 'jornadaThemeProfileFilters';

const DEFAULT = {
  theme: 'Resultados',
  valence: 'Todas',
};

const listeners = new Set();

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT };
}

let state = loadState();

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function notify() {
  for (const fn of listeners) fn(getThemeProfileFilters());
}

/** Filtros locais da seção "Quem são os clientes por trás dos temas?" (Jornada & Perfil). */
export function getThemeProfileFilters() {
  return { ...state };
}

export function setThemeProfileFilters(partial) {
  state = { ...state, ...partial };
  persist();
  notify();
}

export function resetThemeProfileFilters() {
  state = { ...DEFAULT };
  persist();
  notify();
}

export function subscribeThemeProfileFilters(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
