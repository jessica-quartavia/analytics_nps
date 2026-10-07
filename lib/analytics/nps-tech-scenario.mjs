/** Cenário exploratório (não faz parte do modelo preditivo). */

export function clampNps(nps) {
  if (nps == null || Number.isNaN(Number(nps))) return null;
  return Math.max(-100, Math.min(100, Number(nps)));
}

/**
 * NPS cenário = projeção-base + uplift assumido (p.p.).
 * @param {number | null} baseProjectedNps
 * @param {number} technologyUpliftPp default 0
 */
export function npsTechnologyScenario(baseProjectedNps, technologyUpliftPp = 0) {
  if (baseProjectedNps == null || Number.isNaN(Number(baseProjectedNps))) return null;
  const uplift = Number(technologyUpliftPp);
  if (Number.isNaN(uplift)) return clampNps(baseProjectedNps);
  return clampNps(Number(baseProjectedNps) + uplift);
}
