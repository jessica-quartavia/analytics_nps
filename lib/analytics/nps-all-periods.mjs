import { classifyNpsScore, isValidScore } from './nps.mjs';

function parseDateOnly(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function quarterFromDate(dateStr) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-').map(Number);
  if (!y || !m) return null;
  const q = Math.ceil(m / 3);
  return `${y}-Q${q}`;
}

function normalizeCategory(raw, score) {
  if (raw) {
    const c = String(raw).trim();
    if (['Promotor', 'Neutro', 'Detrator'].includes(c)) return c;
    const lower = c.toLowerCase();
    if (lower.includes('promot')) return 'Promotor';
    if (lower.includes('neutr') || lower.includes('passiv')) return 'Neutro';
    if (lower.includes('detrat')) return 'Detrator';
  }
  return classifyNpsScore(score);
}

function textFromBase0(r) {
  const parts = [r.motivo_nota, r.comentario_completo].filter(Boolean);
  return parts.join('\n\n').trim();
}

function matchKeyBase0(r) {
  const d = parseDateOnly(r.data_resposta);
  return `${r.base_qv_id}|${d}|${r.nota}|${r.onda ?? ''}`;
}

function matchKeyCurrent(r) {
  const d = parseDateOnly(r.submitted_at);
  return `${r.client_id}|${d}|${r.score}|${r.analytical_cycle_code ?? ''}`;
}

function strongIdCurrent(r) {
  return r.response_id ?? r.source_response_id ?? null;
}

/**
 * Unifica NPS passado (base0.nps_respostas) + NPS atual (responses.json).
 * Prioridade de dedupe: registro current vence em match confiável.
 */
export function buildNpsAllPeriods({ base0Nps = [], currentResponses = [] } = {}) {
  const audit = {
    base0_total: base0Nps.length,
    current_total: currentResponses.length,
    after_dedupe: 0,
    matched_both: 0,
    base0_only: 0,
    current_only: 0,
    ambiguous: 0,
    with_text_base0: 0,
    with_text_current: 0,
    periods: [],
  };

  const currentByStrong = new Map();
  const currentByMatch = new Map();
  for (const r of currentResponses) {
    if (!isValidScore(r.score)) continue;
    const sid = strongIdCurrent(r);
    if (sid) currentByStrong.set(String(sid), r);
    currentByMatch.set(matchKeyCurrent(r), r);
    if (String(r.comment ?? '').trim()) audit.with_text_current += 1;
  }

  const matchedBase0Keys = new Set();
  const rows = [];

  for (const b of base0Nps) {
    if (!isValidScore(b.nota)) continue;
    const mk = matchKeyBase0(b);
    const cur = currentByMatch.get(mk);
    const text = textFromBase0(b);
    if (text) audit.with_text_base0 += 1;

    if (cur) {
      matchedBase0Keys.add(mk);
      audit.matched_both += 1;
      continue;
    }

    const responseDate = parseDateOnly(b.data_resposta);
    const period = b.onda ?? quarterFromDate(responseDate);
    rows.push({
      response_id: b.dedupe_key ?? `base0:${b.base_qv_id}:${responseDate}:${b.nota}`,
      client_id: b.base_qv_id,
      client_name: b.nome_cliente ?? null,
      source: 'base0',
      period,
      cycle: b.onda ?? period,
      response_date: responseDate,
      score: Number(b.nota),
      nps_category: normalizeCategory(b.categoria, b.nota),
      programa: b.programa ?? null,
      ep: null,
      question_version: null,
      has_comment: Boolean(text),
      comment_text: text || null,
      codigo_cliente: b.codigo_cliente ?? null,
      onda: b.onda ?? null,
    });
    audit.base0_only += 1;
  }

  for (const r of currentResponses) {
    if (!isValidScore(r.score)) continue;
    const mk = matchKeyCurrent(r);
    const responseDate = parseDateOnly(r.submitted_at);
    const period = r.analytical_cycle_code ?? quarterFromDate(responseDate);
    rows.push({
      response_id: strongIdCurrent(r) ?? `current:${r.client_id}:${responseDate}:${r.score}`,
      client_id: r.client_id,
      client_name: r.client_name ?? null,
      source: 'current',
      period,
      cycle: r.analytical_cycle_code ?? period,
      response_date: responseDate,
      score: Number(r.score),
      nps_category: r.nps_category ?? normalizeCategory(null, r.score),
      programa: r.program ?? null,
      ep: r.ep_name ?? null,
      question_version: r.source_cycle_name ?? null,
      has_comment: Boolean(String(r.comment ?? '').trim()),
      comment_text: r.comment ?? null,
      codigo_cliente: r.client_code ?? null,
      onda: r.analytical_cycle_name ?? null,
    });
    if (!matchedBase0Keys.has(mk)) audit.current_only += 1;
  }

  audit.after_dedupe = rows.length;
  const periodSet = new Set(rows.map((x) => x.period).filter(Boolean));
  audit.periods = [...periodSet].sort();

  return {
    meta: {
      definition: {
        nps_passado: 'base0.nps_respostas',
        nps_atual: 'processed/responses.json',
        dedupe: 'current wins on base_qv_id+date+score+cycle match',
      },
    },
    audit,
    responses: rows,
  };
}

export function filterNpsAllPeriods(rows, npsPeriod) {
  if (!rows?.length || !npsPeriod || npsPeriod === 'all') return rows;
  if (npsPeriod === 'base0') return rows.filter((r) => r.source === 'base0');
  if (npsPeriod === 'current') return rows.filter((r) => r.source === 'current');
  return rows.filter((r) => r.period === npsPeriod || r.cycle === npsPeriod);
}

export function listNpsPeriodOptions(doc) {
  const opts = [
    { value: 'all', label: 'Todos os períodos' },
    { value: 'base0', label: 'NPS passado' },
    { value: 'current', label: 'NPS atual' },
  ];
  for (const p of doc?.audit?.periods ?? []) {
    if (p === 'all' || p === 'base0' || p === 'current') continue;
    opts.push({ value: p, label: p });
  }
  const latest = doc?.meta?.current_cycle_label;
  if (latest) opts.push({ value: 'current_cycle', label: latest });
  return opts;
}
