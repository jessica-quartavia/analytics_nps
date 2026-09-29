import { classifyNpsScore } from './nps.mjs';

/**
 * Intervalo de confiança 95% para NPS via bootstrap sobre respostas individuais.
 *
 * Método:
 * - Para cada réplica B=2000, amostra com reposição n scores.
 * - NPS_b = ((P_b - D_b) / n) * 100 (mesma fórmula oficial).
 * - IC95 = percentis 2,5 e 97,5 da distribuição bootstrap de NPS_b.
 *
 * Limitações: assume amostra como proxy da população; não implica causalidade ou previsão.
 */

const DEFAULT_BOOTSTRAP_ITERATIONS = 2000;

/** Mulberry32 — PRNG determinístico a partir de seed. */
function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function npsFromScores(scores) {
  const n = scores.length;
  if (n === 0) return null;
  let p = 0;
  let d = 0;
  for (const s of scores) {
    const cat = classifyNpsScore(s);
    if (cat === 'Promotor') p++;
    else if (cat === 'Detrator') d++;
  }
  return ((p - d) / n) * 100;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * @param {number[]} scores inteiros 0–10
 * @param {{ seed?: number, iterations?: number }} [opts]
 */
export function calculateNpsConfidenceInterval(scores, opts = {}) {
  const n = scores.length;
  if (n === 0) {
    return {
      nps_ci_low: null,
      nps_ci_high: null,
      nps_ci_method: 'bootstrap_percentile_95',
      nps_ci_n: 0,
      nps_ci_iterations: 0,
    };
  }

  const seed = opts.seed ?? 20260616;
  const iterations = opts.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const rng = createRng(seed);
  const samples = [];

  for (let b = 0; b < iterations; b++) {
    const draw = [];
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      draw.push(scores[j]);
    }
    const npsB = npsFromScores(draw);
    if (npsB != null) samples.push(npsB);
  }

  samples.sort((a, b) => a - b);

  return {
    nps_ci_low: percentile(samples, 0.025),
    nps_ci_high: percentile(samples, 0.975),
    nps_ci_method: 'bootstrap_percentile_95',
    nps_ci_n: n,
    nps_ci_iterations: iterations,
    nps_ci_seed: seed,
  };
}
