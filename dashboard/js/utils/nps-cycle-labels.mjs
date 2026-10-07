import { cycleSortKey } from './cycle-sort.mjs';

/** Ciclos técnicos → trimestre canônico (view only). */
const TECHNICAL_TO_CANONICAL = {
  'NPS-2026-JUN-JUL-PHARUS': '2026-Q2',
  'NPS-2026-SET-PHARUS': '2026-Q3',
  'Onda 1 (jun a jul/26)': '2026-Q2',
  'Onda 2 (set/26)': '2026-Q3',
};

const FRIENDLY_CYCLE = {
  'NPS-2026-JUN-JUL-PHARUS': 'Jun–Jul/2026',
  'NPS-2026-SET-PHARUS': 'Set/2026',
};

export function canonicalizeNpsCycle(ciclo) {
  if (!ciclo) return ciclo;
  return TECHNICAL_TO_CANONICAL[ciclo] ?? ciclo;
}

export function isTechnicalNpsCycle(ciclo) {
  if (!ciclo) return false;
  return ciclo in TECHNICAL_TO_CANONICAL && TECHNICAL_TO_CANONICAL[ciclo] !== ciclo;
}

export function formatNpsCycleLabel(ciclo) {
  if (!ciclo) return '—';
  const canon = canonicalizeNpsCycle(ciclo);
  if (/^\d{4}-Q\d$/.test(canon)) return canon;
  return FRIENDLY_CYCLE[ciclo] ?? canon;
}

export function formatNpsPeriodLabel(value) {
  const map = {
    all: 'Todos',
    base0: 'NPS passado',
    current: 'NPS atual',
  };
  return map[value] ?? value;
}

/**
 * Remove ciclos técnicos duplicados quando o trimestre canônico já existe.
 * Preferir linha oficial (is_official) ao mesclar.
 */
export function prepareHistoricoDisplayCycles(cycles) {
  const list = cycles ?? [];
  const canonicalPresent = new Set(list.map((c) => canonicalizeNpsCycle(c.ciclo)));

  const filtered = list.filter((c) => {
    if (!isTechnicalNpsCycle(c.ciclo)) return true;
    const canon = canonicalizeNpsCycle(c.ciclo);
    return !canonicalPresent.has(canon) || c.ciclo === canon;
  });

  const byCanon = new Map();
  for (const c of filtered) {
    const key = canonicalizeNpsCycle(c.ciclo);
    const prev = byCanon.get(key);
    if (!prev) {
      byCanon.set(key, { ...c, ciclo: key });
      continue;
    }
    if (c.is_official && !prev.is_official) byCanon.set(key, { ...c, ciclo: key });
  }

  return [...byCanon.values()].sort((a, b) => cycleSortKey(a.ciclo) - cycleSortKey(b.ciclo));
}

export function uniqueCanonicalCycleList(rawCycles) {
  const set = new Set((rawCycles ?? []).map((c) => canonicalizeNpsCycle(c)).filter(Boolean));
  return [...set].sort((a, b) => cycleSortKey(a) - cycleSortKey(b));
}

export function cycleFilterMatches(rowCycle, filterCiclo) {
  if (!filterCiclo) return true;
  return canonicalizeNpsCycle(rowCycle) === filterCiclo;
}
