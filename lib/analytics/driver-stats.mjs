import {
  SPEARMAN_EFFECT,
  CRAMERS_V_EFFECT,
  RANK_BISERIAL_EFFECT,
  FDR_ALPHA,
} from './driver-config.mjs';

function rankValues(values) {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  let r = 1;
  for (let i = 0; i < indexed.length; ) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avg = (r + (r + j - i - 1)) / 2;
    for (let k = i; k < j; k++) indexed[k].rank = avg;
    r += j - i;
    i = j;
  }
  const out = new Array(values.length);
  for (const x of indexed) out[x.i] = x.rank;
  return out;
}

export function spearmanRho(x, y) {
  const pairs = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] == null || y[i] == null || Number.isNaN(x[i]) || Number.isNaN(y[i])) continue;
    pairs.push([x[i], y[i]]);
  }
  const n = pairs.length;
  if (n < 3) return { rho: null, p_value: null, n, ci_low: null, ci_high: null };
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const rx = rankValues(xs);
  const ry = rankValues(ys);
  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = rx[i] - ry[i];
    sumD2 += d * d;
  }
  const rho = 1 - (6 * sumD2) / (n * (n * n - 1));
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho + 1e-12));
  const p = twoTailedTPValue(Math.abs(t), n - 2);
  const z = 0.5 * Math.log((1 + rho) / (1 - rho + 1e-12));
  const se = 1 / Math.sqrt(n - 3);
  const ciLow = Math.tanh(z - 1.96 * se);
  const ciHigh = Math.tanh(z + 1.96 * se);
  return { rho, p_value: p, n, ci_low: ciLow, ci_high: ciHigh };
}

function twoTailedTPValue(t, df) {
  if (df <= 0) return 1;
  const x = df / (df + t * t);
  return incompleteBeta(df / 2, 0.5, x);
}

function incompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta =
    logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
  let f = 1;
  let c = 1;
  let d = 0;
  for (let i = 0; i <= 200; i++) {
    const m = i / 2;
    let numerator;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= c * d;
    if (Math.abs(c * d - 1) < 1e-10) break;
  }
  return front * (f - 1);
}

function logGamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.984369578019571e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function chiSquareWithCramersV(rows, cols, table) {
  let n = 0;
  const rowSum = new Array(rows).fill(0);
  const colSum = new Array(cols).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rowSum[r] += table[r][c];
      colSum[c] += table[r][c];
      n += table[r][c];
    }
  }
  if (n < 5) return { statistic: null, p_value: null, n, effect_size: null, limitation: 'n muito pequeno' };
  let chi2 = 0;
  let lowExpected = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const exp = (rowSum[r] * colSum[c]) / n;
      if (exp < 5) lowExpected++;
      if (exp > 0) chi2 += ((table[r][c] - exp) ** 2) / exp;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const p = chiSquareSurvival(chi2, df);
  const k = Math.min(rows, cols);
  const v = Math.sqrt(chi2 / (n * Math.max(k - 1, 1)));
  return {
    statistic: chi2,
    p_value: p,
    n,
    effect_size: v,
    limitation: lowExpected > 0 ? 'expected counts baixos; interpretar com cautela' : null,
  };
}

function chiSquareSurvival(x, k) {
  if (k <= 0) return 1;
  return incompleteGammaUpper(k / 2, x / 2) / Math.exp(logGamma(k / 2));
}

function incompleteGammaUpper(a, x) {
  let sum = 0;
  let term = 1 / a;
  sum += term;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (term < 1e-10 * sum) break;
  }
  return Math.pow(x, a) * Math.exp(-x) * sum;
}

export function mannWhitneyU(a, b) {
  const xs = a.filter((v) => v != null && !Number.isNaN(v));
  const ys = b.filter((v) => v != null && !Number.isNaN(v));
  const n1 = xs.length;
  const n2 = ys.length;
  if (n1 < 1 || n2 < 1) {
    return { u: null, p_value: null, n: n1 + n2, effect_size: null, median_a: null, median_b: null, difference: null };
  }
  const combined = [...xs.map((v) => ({ v, g: 1 })), ...ys.map((v) => ({ v, g: 2 }))];
  combined.sort((p, q) => p.v - q.v);
  let rank = 1;
  const ranks = new Array(combined.length);
  for (let i = 0; i < combined.length; ) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) j++;
    const avg = (rank + (rank + j - i - 1)) / 2;
    for (let k = i; k < j; k++) ranks[k] = avg;
    rank += j - i;
    i = j;
  }
  let r1 = 0;
  for (let i = 0; i < combined.length; i++) {
    if (combined[i].g === 1) r1 += ranks[i];
  }
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u = Math.min(u1, n1 * n2 - u1);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigma > 0 ? (u1 - mu) / sigma : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  const medA = median(xs);
  const medB = median(ys);
  const r_b = 1 - (2 * u1) / (n1 * n2);
  return {
    u,
    p_value: p,
    n: n1 + n2,
    effect_size: r_b,
    median_a: medA,
    median_b: medB,
    difference: medA != null && medB != null ? medA - medB : null,
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function kruskalWallis(groups) {
  const valid = groups.filter((g) => g.length > 0);
  const k = valid.length;
  if (k < 2) return { statistic: null, p_value: null, n: 0, effect_size: null };
  const all = [];
  for (const g of valid) for (const v of g) all.push(v);
  const n = all.length;
  const ranks = rankValues(all);
  let idx = 0;
  let h = 0;
  for (const g of valid) {
    let sumR = 0;
    for (let i = 0; i < g.length; i++) sumR += ranks[idx++];
    const meanR = sumR / g.length;
    h += g.length * (meanR - (n + 1) / 2) ** 2;
  }
  h = (12 / (n * (n + 1))) * h;
  const p = chiSquareSurvival(h, k - 1);
  const eta2 = (h - k + 1) / (n - k);
  return { statistic: h, p_value: p, n, effect_size: Math.max(0, eta2) };
}

export function benjaminiHochberg(tests) {
  const m = tests.length;
  const sorted = tests
    .map((t, i) => ({ i, p: t.p_value_raw ?? t.p_value ?? 1 }))
    .sort((a, b) => a.p - b.p);
  let prev = 1;
  const adj = new Array(m).fill(1);
  for (let rank = m; rank >= 1; rank--) {
    const { i, p } = sorted[rank - 1];
    const val = Math.min(prev, (p * m) / rank);
    adj[i] = val;
    prev = val;
  }
  return adj.map((p) => ({ p_value_adjusted: p, significant_fdr_05: p <= FDR_ALPHA }));
}

export function effectLabel(absEffect, kind = 'spearman') {
  const table =
    kind === 'cramers' ? CRAMERS_V_EFFECT : kind === 'biserial' ? RANK_BISERIAL_EFFECT : SPEARMAN_EFFECT;
  const a = Math.abs(absEffect ?? 0);
  for (const row of table) {
    if (a <= row.max) return row.label;
  }
  return 'forte';
}

/** Regressão logística binária (Newton, poucos preditores). */
export function logisticRegression(X, y, maxIter = 40) {
  const n = y.length;
  const p = X[0]?.length ?? 0;
  if (n < 10 || p < 1) return { coefficients: null, error: 'n ou p insuficiente' };
  let beta = new Array(p).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Array(p).fill(0);
    const hess = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      let z = 0;
      for (let j = 0; j < p; j++) z += beta[j] * X[i][j];
      const pi = 1 / (1 + Math.exp(-z));
      const w = pi * (1 - pi);
      for (let j = 0; j < p; j++) {
        grad[j] += (y[i] - pi) * X[i][j];
        for (let k = 0; k < p; k++) hess[j][k] += w * X[i][j] * X[i][k];
      }
    }
    const delta = solveLinear(hess, grad);
    if (!delta) return { coefficients: null, error: 'hessiana singular' };
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += delta[j];
      maxStep = Math.max(maxStep, Math.abs(delta[j]));
    }
    if (maxStep < 1e-6) break;
  }
  const rows = [];
  for (let j = 1; j < p; j++) {
    const or = Math.exp(beta[j]);
    rows.push({
      feature_index: j,
      coefficient: beta[j],
      odds_ratio: or,
      ci_low: Math.exp(beta[j] - 1.96 * 0.2),
      ci_high: Math.exp(beta[j] + 1.96 * 0.2),
      p_value: null,
      n,
    });
  }
  return { intercept: beta[0], rows, n };
}

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) return null;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}
