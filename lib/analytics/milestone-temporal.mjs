/** Utilitários temporais — marcos da jornada × NPS (event_at <= submitted_at). */

export function parseTs(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function daysBetween(a, b) {
  const t1 = parseTs(a);
  const t2 = parseTs(b);
  if (t1 == null || t2 == null) return null;
  return Math.floor((t2 - t1) / 86400000);
}

export function isOnOrBefore(eventAt, submittedAt) {
  const te = parseTs(eventAt);
  const ts = parseTs(submittedAt);
  if (te == null || ts == null) return false;
  return te <= ts;
}

export function isStrictlyBetween(eventAt, afterExclusive, onOrBefore) {
  const te = parseTs(eventAt);
  const t0 = parseTs(afterExclusive);
  const t1 = parseTs(onOrBefore);
  if (te == null || t0 == null || t1 == null) return false;
  return te > t0 && te <= t1;
}

export function median(values) {
  const xs = values.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function mean(values) {
  const xs = values.filter((v) => v != null && !Number.isNaN(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function pctTrue(rows, predicate) {
  if (!rows.length) return null;
  let n = 0;
  for (const r of rows) if (predicate(r)) n++;
  return (n / rows.length) * 100;
}

export function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export function iqr(values) {
  const xs = values.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!xs.length) return { q1: null, q3: null, iqr: null };
  return {
    q1: percentile(xs, 0.25),
    q3: percentile(xs, 0.75),
    iqr: percentile(xs, 0.75) - percentile(xs, 0.25),
  };
}
