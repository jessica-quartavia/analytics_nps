/** Agregações client-side para filtros globais (sem alterar datasets). */

function classifyNpsScore(score) {
  if (score == null || Number.isNaN(score)) return null;
  if (score <= 6) return 'Detrator';
  if (score <= 8) return 'Neutro';
  return 'Promotor';
}

export function filterMilestoneEntriesByClients(entries, clientIds) {
  if (!clientIds?.size) return entries;
  return entries.filter((e) => clientIds.has(e.client_id));
}

export function npsFromScores(scores) {
  const xs = scores.filter((s) => s != null && !Number.isNaN(s));
  if (!xs.length) return null;
  let p = 0;
  let d = 0;
  for (const s of xs) {
    const c = classifyNpsScore(s);
    if (c === 'Promotor') p++;
    else if (c === 'Detrator') d++;
  }
  return ((p - d) / xs.length) * 100;
}

export function pctTrue(rows, pred) {
  if (!rows.length) return null;
  return (rows.filter(pred).length / rows.length) * 100;
}

export function median(nums) {
  const s = nums.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mechanismBucket(count) {
  if (count == null || Number.isNaN(count)) return null;
  const n = Number(count);
  if (n >= 2) return '2+';
  if (n === 1) return '1';
  if (n === 0) return '0';
  return null;
}

export function qualityLabelFriendly(technical) {
  const map = {
    good: 'Boa cobertura',
    partial: 'Cobertura parcial',
    low: 'Dados insuficientes',
    unknown: '—',
    point_in_time: 'Boa cobertura',
    current_proxy: 'Etapa atual',
    unavailable: 'Dados insuficientes',
  };
  return map[technical] ?? technical ?? '—';
}

export function filterFinancialDoc(doc, clientIds) {
  if (!doc || !clientIds?.size) return doc;
  const entries = (doc.entries ?? []).filter((e) => clientIds.has(e.client_id));
  const tiers = ['T1', 'T2', 'T3', 'T4', 'unavailable'];
  const npsByTier = Object.fromEntries(
    tiers.map((t) => {
      const rows = entries.filter((e) => e.tier === t);
      const scores = rows.map((r) => r.score);
      return [
        t,
        {
          n: rows.length,
          nps: npsFromScores(scores),
          mean_score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        },
      ];
    }),
  );
  return {
    ...doc,
    entries,
    nps_by_tier: npsByTier,
    financial_profile_coverage: {
      ...doc.financial_profile_coverage,
      respondents_total: entries.length,
      financial_rows: entries.filter((e) => e.has_financial_row).length,
    },
    _filtered: true,
  };
}
