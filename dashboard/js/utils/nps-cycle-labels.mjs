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

function historicoPndSampleSize(row) {
  if (!row) return 0;
  const derived = row.respostas_derivadas;
  if (Number.isFinite(derived)) return derived;
  const sum = (row.promotores ?? 0) + (row.neutros ?? 0) + (row.detratores ?? 0);
  return sum;
}

function pickRicherHistoricoPnd(a, b) {
  return historicoPndSampleSize(b) > historicoPndSampleSize(a) ? b : a;
}

function mergeHistoricoCycleRows(prev, next, key) {
  const metaBase =
    next.is_official && !prev.is_official
      ? { ...next, ciclo: key }
      : prev.is_official && !next.is_official
        ? { ...prev, ciclo: key }
        : { ...prev, ...next, ciclo: key };
  const pnd = pickRicherHistoricoPnd(prev, next);
  return {
    ...metaBase,
    promotores: pnd.promotores,
    neutros: pnd.neutros,
    detratores: pnd.detratores,
    pct_promotores: pnd.pct_promotores,
    pct_neutros: pnd.pct_neutros,
    pct_detratores: pnd.pct_detratores,
    respostas_derivadas: Math.max(
      historicoPndSampleSize(prev),
      historicoPndSampleSize(next),
    ),
    clientes_unicos: Math.max(prev.clientes_unicos ?? 0, next.clientes_unicos ?? 0),
  };
}

/**
 * Remove ciclos técnicos duplicados quando o trimestre canônico já existe.
 * Preferir linha oficial (is_official) para NPS oficial; P/N/D da amostra mais completa.
 */
export function prepareHistoricoDisplayCycles(cycles) {
  const list = cycles ?? [];
  const byCanon = new Map();
  for (const c of list) {
    const key = canonicalizeNpsCycle(c.ciclo);
    const prev = byCanon.get(key);
    if (!prev) {
      byCanon.set(key, { ...c, ciclo: key });
      continue;
    }
    byCanon.set(key, mergeHistoricoCycleRows(prev, c, key));
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
