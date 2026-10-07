import { cycleSortKey } from '../utils/cycle-sort.mjs';
import { canonicalizeNpsCycle, cycleFilterMatches } from '../utils/nps-cycle-labels.mjs';
import { npsFromScores } from './historico-nps-view.mjs';

export function sampleBadgeHtml(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  if (num >= 30) return '';
  if (num >= 10) return '<span class="sample-badge sample-badge--low">amostra baixa</span>';
  return '<span class="sample-badge sample-badge--very-low">amostra muito baixa</span>';
}

export function defaultHistoricoPitFilters() {
  return {
    tenure: '',
    meetings: '',
    meetingRecency: '',
    mechanism: '',
    epTransfers: '',
  };
}

function normCat(c) {
  const s = (c ?? '').toLowerCase();
  if (s.includes('promot')) return 'Promotor';
  if (s.includes('detrat')) return 'Detrator';
  if (s.includes('neutr')) return 'Neutro';
  return c ?? '';
}

export function indexEnrichedByResponseId(rows) {
  const m = new Map();
  for (const r of rows ?? []) {
    if (r.response_id) m.set(r.response_id, r);
  }
  return m;
}

export function filterEnrichedRows(rows, f, clientRecurrenceMap) {
  let out = rows ?? [];
  if (f.ciclo) out = out.filter((r) => cycleFilterMatches(r.nps_cycle, f.ciclo));
  if (f.programa) out = out.filter((r) => (r.programa ?? '').toUpperCase() === f.programa.toUpperCase());
  if (f.ep) out = out.filter((r) => r.ep_current_or_resolved === f.ep);
  if (f.safra) out = out.filter((r) => r.safra_trimestre === f.safra);
  if (f.categoria) out = out.filter((r) => normCat(r.nps_category) === f.categoria);
  if (f.tenure) out = out.filter((r) => r.tenure_bucket_at_response === f.tenure);
  if (f.meetings) out = out.filter((r) => r.meetings_count_bucket === f.meetings);
  if (f.meetingRecency) out = out.filter((r) => r.meeting_recency_bucket === f.meetingRecency);
  if (f.mechanism === 'yes') out = out.filter((r) => r.has_implemented_mechanism_at_response === true);
  if (f.mechanism === 'no') {
    out = out.filter(
      (r) =>
        r.mechanism_temporal_status !== 'date_unavailable' &&
        r.has_implemented_mechanism_at_response === false,
    );
  }
  if (f.epTransfers === '0') out = out.filter((r) => (r.ep_transfers_before_response ?? 0) === 0);
  if (f.epTransfers === '1') out = out.filter((r) => r.ep_transfers_before_response === 1);
  if (f.epTransfers === '2+') out = out.filter((r) => (r.ep_transfers_before_response ?? 0) >= 2);
  if (f.recorrencia && clientRecurrenceMap) {
    out = out.filter((r) => {
      if (!r.client_id) return false;
      const n = clientRecurrenceMap.get(r.client_id) ?? 0;
      if (f.recorrencia === '1') return n === 1;
      if (f.recorrencia === '2') return n === 2;
      if (f.recorrencia === '3+') return n >= 3;
      return true;
    });
  }
  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    out = out.filter((r) => (r.client_name ?? '').toLowerCase().includes(q));
  }
  return out;
}

export function filterResponsesViaEnriched(allResponses, enrichedFiltered) {
  const keys = new Set(enrichedFiltered.map((r) => r.response_id).filter(Boolean));
  if (!keys.size) return [];
  return (allResponses ?? []).filter((r) => keys.has(r.response_key));
}

export function median(nums) {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

export function aggregateNpsBucket(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null || k === '') continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const out = {};
  for (const [k, bucketRows] of map) {
    const byClient = new Map();
    for (const r of bucketRows) {
      if (r.score == null || Number.isNaN(Number(r.score))) continue;
      const id = r.client_id ?? r.base_qv_id;
      if (!id) continue;
      const score = Number(r.score);
      const ts = Date.parse(String(r.response_date ?? r.submitted_at ?? '').replace(' ', 'T')) || 0;
      const ex = byClient.get(id);
      if (!ex || ts >= ex.ts) byClient.set(id, { score, ts });
    }
    const scores = [...byClient.values()].map((x) => x.score);
    const prom = scores.filter((s) => s >= 9).length;
    const det = scores.filter((s) => s <= 6).length;
    const neu = scores.length - prom - det;
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    out[k] = {
      n: scores.length,
      nps: npsFromScores(scores),
      avg: avg != null ? Math.round(avg * 100) / 100 : null,
      p: prom,
      neu,
      det,
      sufficient_sample: scores.length >= 30,
    };
  }
  return out;
}

export function mechanismBreakdown(enrichedRows) {
  let com = 0;
  let sem = 0;
  let dateUnavailable = 0;
  for (const r of enrichedRows) {
    if (r.mechanism_temporal_status === 'date_unavailable') {
      dateUnavailable += 1;
      continue;
    }
    if (r.has_implemented_mechanism_at_response) com += 1;
    else sem += 1;
  }
  return { com, sem, dateUnavailable };
}

export function epTransferBucket(n) {
  if (n == null || n === 0) return '0 trocas';
  if (n === 1) return '1 troca';
  return '2+ trocas';
}

export function financialQuartileBuckets(rows) {
  const amounts = rows
    .map((r) => r.amount_paid_before_response)
    .filter((v) => v != null && Number.isFinite(Number(v)))
    .map(Number)
    .sort((a, b) => a - b);
  if (amounts.length < 4) return null;
  const q = (p) => {
    const idx = (amounts.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return amounts[lo];
    return amounts[lo] + (amounts[hi] - amounts[lo]) * (idx - lo);
  };
  return { q1: q(0.25), q2: q(0.5), q3: q(0.75), min: amounts[0], max: amounts[amounts.length - 1] };
}

export function financialBucketLabel(amount, quartiles) {
  if (amount == null || !quartiles) return 'Sem dado';
  const v = Number(amount);
  if (v <= quartiles.q1) return `Até Q1 (≤ ${formatMoney(quartiles.q1)})`;
  if (v <= quartiles.q2) return `Q1–Q2`;
  if (v <= quartiles.q3) return `Q2–Q3`;
  return `Acima Q3`;
}

function formatMoney(n) {
  return Math.round(n).toLocaleString('pt-BR');
}

export function buildSafraEntradaSeries(cohorts) {
  const map = new Map();
  for (const c of cohorts ?? []) {
    const s = c.safra_trimestre;
    if (!s || c.invalid_future_entry_date) continue;
    if (String(s).startsWith('2027')) continue;
    if (!map.has(s)) map.set(s, { total: 0, answered: 0 });
    const row = map.get(s);
    row.total += 1;
    if (c.ever_answered_nps) row.answered += 1;
  }
  return [...map.entries()]
    .sort(([a], [b]) => cycleSortKey(a) - cycleSortKey(b))
    .map(([safra, v]) => ({
      safra,
      clientes: v.total,
      pct_answered: v.total ? Math.round((1000 * v.answered) / v.total) / 10 : 0,
    }));
}

export function buildSafraCicloMatrix(enrichedRows, cohorts, metric = 'nps') {
  const safras = [
    ...new Set(
      (cohorts ?? [])
        .map((c) => c.safra_trimestre)
        .filter((s) => s && !String(s).startsWith('2027')),
    ),
  ].sort((a, b) => cycleSortKey(a) - cycleSortKey(b));
  const ciclos = [
    ...new Set(enrichedRows.map((r) => canonicalizeNpsCycle(r.nps_cycle)).filter(Boolean)),
  ].sort((a, b) => cycleSortKey(a) - cycleSortKey(b));
  const cohortByClient = new Map((cohorts ?? []).map((c) => [c.client_id, c]));
  const cells = new Map();
  for (const r of enrichedRows) {
    const safra = r.safra_trimestre ?? cohortByClient.get(r.client_id)?.safra_trimestre;
    const ciclo = canonicalizeNpsCycle(r.nps_cycle);
    if (!safra || !ciclo || String(safra).startsWith('2027')) continue;
    const key = `${safra}|${ciclo}`;
    if (!cells.has(key)) cells.set(key, []);
    if (r.score != null) cells.get(key).push(Number(r.score));
  }
  const safraTotals = new Map();
  for (const c of cohorts ?? []) {
    const s = c.safra_trimestre;
    if (!s || String(s).startsWith('2027')) continue;
    safraTotals.set(s, (safraTotals.get(s) ?? 0) + 1);
  }
  return { safras, ciclos, cells, safraTotals, metric };
}

export function cellValue(scores, metric, safraTotal) {
  if (!scores?.length) return { display: '—', n: 0, tooltip: 'N=0' };
  const n = scores.length;
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  const avg = scores.reduce((a, b) => a + b, 0) / n;
  if (metric === 'nps') {
    return {
      display: npsFromScores(scores)?.toFixed(1) ?? '—',
      n,
      tooltip: `N=${n}`,
    };
  }
  if (metric === 'avg') {
    return { display: avg.toFixed(1), n, tooltip: `N=${n}` };
  }
  if (metric === 'responses') {
    return { display: String(n), n, tooltip: `N=${n}` };
  }
  const pct = safraTotal ? Math.round((1000 * n) / safraTotal) / 10 : null;
  return { display: pct != null ? `${pct}%` : '—', n, tooltip: `N=${n} de ${safraTotal}` };
}

export function buildClientExplorerRows(enrichedByClient, cohorts, recMap) {
  const cohortMap = new Map((cohorts ?? []).map((c) => [c.client_id, c]));
  const rows = [];
  for (const [clientId, responses] of enrichedByClient) {
    const sorted = [...responses].sort((a, b) =>
      String(a.response_date).localeCompare(String(b.response_date)),
    );
    const last = sorted[sorted.length - 1];
    const cohort = cohortMap.get(clientId);
    rows.push({
      client_id: clientId,
      client_name: last?.client_name ?? cohort?.client_name ?? '—',
      safra_trimestre: last?.safra_trimestre ?? cohort?.safra_trimestre ?? '—',
      payment_entry_date: last?.payment_entry_date ?? cohort?.payment_entry_date ?? null,
      months_since_entry: last?.months_since_entry,
      programa: last?.programa ?? cohort?.programa ?? '—',
      ep: last?.ep_current_or_resolved ?? cohort?.ep ?? '—',
      qtd_nps: sorted.length,
      last_score: last?.score,
      last_category: last?.nps_category,
      meetings_last: last?.meetings_before_response,
      mechanism_last: last?.has_implemented_mechanism_at_response,
      mechanism_status: last?.mechanism_temporal_status,
      last_cycle: last?.nps_cycle,
      recurrence: recMap?.get(clientId) ?? sorted.length,
    });
  }
  rows.sort((a, b) => (a.client_name ?? '').localeCompare(b.client_name ?? ''));
  return rows;
}

export function groupEnrichedByClient(enrichedRows) {
  const m = new Map();
  for (const r of enrichedRows) {
    if (!r.client_id) continue;
    if (!m.has(r.client_id)) m.set(r.client_id, []);
    m.get(r.client_id).push(r);
  }
  return m;
}

export function participationStats(recMap, enrichedRows, currentCycle) {
  const totalClients = recMap.size || new Set(enrichedRows.map((r) => r.client_id)).size;
  let once = 0;
  let twice = 0;
  let threePlus = 0;
  for (const n of recMap.values()) {
    if (n === 1) once += 1;
    else if (n === 2) twice += 1;
    else if (n >= 3) threePlus += 1;
  }
  const byClientCycle = new Map();
  for (const r of enrichedRows) {
    if (!r.client_id || !r.nps_cycle) continue;
    byClientCycle.set(`${r.client_id}|${r.nps_cycle}`, true);
  }
  let currentCycleClients = 0;
  if (currentCycle) {
    const set = new Set(
      enrichedRows.filter((r) => r.nps_cycle === currentCycle).map((r) => r.client_id),
    );
    currentCycleClients = set.size;
  }
  const prev = null;
  return {
    once,
    twice,
    threePlus,
    totalClients,
    currentCycleClients,
    pctOnce: totalClients ? Math.round((1000 * once) / totalClients) / 10 : 0,
  };
}

export function officialMedicoesMatch(cycles) {
  const expected = [
    ['2025-Q2', 21.3],
    ['2025-Q3', 24.0],
    ['2025-Q4', 35.1],
    ['2026-Q1', 45.9],
    ['2026-Q2', 68.7],
    ['2026-Q3', 59.6],
  ];
  const off = new Map(
    (cycles ?? []).filter((c) => c.is_official).map((c) => [c.ciclo, c.nps_oficial]),
  );
  return expected.every(([ciclo, nps]) => {
    const v = off.get(ciclo);
    return v != null && Math.abs(v - nps) < 0.05;
  });
}

export function snapshotDisplayDate(snapshot, summaryMeta) {
  const raw =
    snapshot?.raw_snapshot ??
    snapshot?.generated_at ??
    summaryMeta?.generated_at ??
    summaryMeta?.as_of;
  if (!raw) return '—';
  const s = String(raw);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    return new Date(s).toLocaleDateString('pt-BR');
  } catch {
    return s.slice(0, 10);
  }
}
