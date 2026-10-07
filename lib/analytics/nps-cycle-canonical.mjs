/** Ciclos canônicos (lib — alinhado ao dashboard nps-cycle-labels.mjs). */
export const TECHNICAL_TO_CANONICAL = {
  'NPS-2026-JUN-JUL-PHARUS': '2026-Q2',
  'NPS-2026-SET-PHARUS': '2026-Q3',
  'Onda 1 (jun a jul/26)': '2026-Q2',
  'Onda 2 (set/26)': '2026-Q3',
};

export function canonicalizeNpsCycle(ciclo) {
  if (!ciclo) return ciclo;
  return TECHNICAL_TO_CANONICAL[ciclo] ?? ciclo;
}

export function cycleSortKey(ciclo) {
  const canon = canonicalizeNpsCycle(ciclo);
  const s = String(canon ?? '');
  const m = s.match(/^(\d{4})-Q(\d)/);
  if (m) return Number(m[1]) * 10 + Number(m[2]);
  return 9000 + s.charCodeAt(0);
}

export function quarterStartIso(cycle) {
  const canon = canonicalizeNpsCycle(cycle);
  const m = String(canon).match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  const month = (Number(m[2]) - 1) * 3 + 1;
  return `${m[1]}-${String(month).padStart(2, '0')}-01`;
}

export function nextCanonicalCycle(cycle) {
  const canon = canonicalizeNpsCycle(cycle);
  const m = String(canon).match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  let y = Number(m[1]);
  let q = Number(m[2]) + 1;
  if (q > 4) {
    q = 1;
    y += 1;
  }
  return `${y}-Q${q}`;
}
