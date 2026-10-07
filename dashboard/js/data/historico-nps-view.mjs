import { cycleSortKey } from '../utils/cycle-sort.mjs';
import { canonicalizeNpsCycle } from '../utils/nps-cycle-labels.mjs';

export function defaultHistoricoFilters() {
  return {
    ciclo: '',
    programa: '',
    ep: '',
    safra: '',
    categoria: '',
    versao: '',
    recorrencia: '',
    search: '',
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

export function filterResponses(rows, f, clientRecurrenceMap) {
  let out = rows ?? [];
  if (f.ciclo) out = out.filter((r) => r.ciclo === f.ciclo);
  if (f.programa) out = out.filter((r) => (r.programa ?? '').toUpperCase() === f.programa.toUpperCase());
  if (f.ep) out = out.filter((r) => r.ep === f.ep);
  if (f.safra) out = out.filter((r) => r.safra_trimestre === f.safra);
  if (f.categoria) out = out.filter((r) => normCat(r.categoria) === f.categoria);
  if (f.versao) out = out.filter((r) => (r.versao_formulario ?? r.historico_fields?.versao_formulario) === f.versao);
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

export function npsFromScores(scores) {
  if (!scores.length) return null;
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return Math.round(((100 * prom - 100 * det) / scores.length) * 10) / 10;
}

export function computeFilteredCycleSummary(filtered, officialCycles) {
  const byCiclo = new Map();
  for (const r of filtered) {
    if (!r.ciclo || r.nota_nps == null) continue;
    const ciclo = canonicalizeNpsCycle(r.ciclo);
    if (!byCiclo.has(ciclo)) byCiclo.set(ciclo, []);
    byCiclo.get(ciclo).push(r.nota_nps);
  }
  const official = new Map(
    (officialCycles ?? []).map((c) => [canonicalizeNpsCycle(c.ciclo), c]),
  );
  return [...byCiclo.entries()]
    .sort(([a], [b]) => cycleSortKey(a) - cycleSortKey(b))
    .map(([ciclo, scores]) => {
      const off = official.get(ciclo);
      return {
        ciclo,
        nps_oficial: off?.nps ?? null,
        nps_filtrado: npsFromScores(scores),
        respostas_filtradas: scores.length,
        respostas_oficial: off?.respostas ?? null,
      };
    });
}

export function buildMovementCounts(responses, cycleFrom, cycleTo) {
  const byClient = new Map();
  for (const r of responses) {
    if (!r.client_id || r.nota_nps == null) continue;
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, new Map());
    byClient.get(r.client_id).set(r.ciclo, normCat(r.categoria));
  }
  const counts = {};
  const keys = [
    'Promotor',
    'Neutro',
    'Detrator',
  ];
  for (const a of keys) for (const b of keys) counts[`${a}→${b}`] = 0;
  for (const m of byClient.values()) {
    const from = m.get(cycleFrom);
    const to = m.get(cycleTo);
    if (!from || !to) continue;
    counts[`${from}→${to}`] = (counts[`${from}→${to}`] ?? 0) + 1;
  }
  return counts;
}

export function scoreTrendBuckets(clientsFiltered) {
  let up = 0;
  let flat = 0;
  let down = 0;
  const deltas = [];
  for (const c of clientsFiltered) {
    if (c.qtd_medicoes < 2 || c.delta == null) continue;
    deltas.push(c.delta);
    if (c.delta > 0) up += 1;
    else if (c.delta < 0) down += 1;
    else flat += 1;
  }
  const n = up + flat + down;
  const avgDelta = deltas.length
    ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10
    : null;
  return { up, flat, down, n, avgDelta };
}

export function secondaryScoresByCycle(filtered) {
  const fields = [
    ['nota_estrategista', 'Estrategista'],
    ['nota_backoffice', 'Backoffice'],
    ['nota_qv360', 'QV360'],
    ['nota_arquitetura_patrimonial', 'Arquitetura'],
  ];
  const cycles = [...new Set(filtered.map((r) => r.ciclo).filter(Boolean))].sort(
    (a, b) => cycleSortKey(a) - cycleSortKey(b),
  );
  const rows = cycles.map((ciclo) => {
    const slice = filtered.filter((r) => r.ciclo === ciclo);
    const row = { ciclo, n: slice.length };
    for (const [key, label] of fields) {
      const vals = slice
        .map((r) => r.historico_fields?.[key])
        .filter((v) => v != null && String(v).trim() !== '')
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      row[label] = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
      row[`${label}_n`] = vals.length;
    }
    return row;
  });
  return rows;
}

export function commentStatsByCycle(filtered) {
  const map = new Map();
  for (const r of filtered) {
    if (!r.ciclo) continue;
    if (!map.has(r.ciclo)) map.set(r.ciclo, { total: 0, withComment: 0 });
    const g = map.get(r.ciclo);
    g.total += 1;
    if (r.has_comment) g.withComment += 1;
  }
  return [...map.entries()]
    .sort(([a], [b]) => cycleSortKey(a) - cycleSortKey(b))
    .map(([ciclo, g]) => ({
      ciclo,
      respostas: g.total,
      com_comentario: g.withComment,
      pct: g.total ? Math.round((1000 * g.withComment) / g.total) / 10 : 0,
    }));
}

export function clientRecurrenceMap(clients) {
  return new Map(clients.map((c) => [c.client_id, c.qtd_medicoes]));
}

export function epOptionsFromResponses(rows) {
  return [...new Set(rows.map((r) => r.ep).filter(Boolean))].sort();
}

export function safraOptionsFromResponses(rows) {
  return [...new Set(rows.map((r) => r.safra_trimestre).filter(Boolean))].sort();
}

export function cycleOptions(summary) {
  return (summary?.cycles ?? []).map((c) => c.ciclo);
}
