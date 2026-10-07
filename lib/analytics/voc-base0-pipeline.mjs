import { buildResponseTopicsRows } from './voc-classifier.mjs';
import { buildTopicSummaryDocument } from './topic-summary.mjs';
import { classifyNpsScore, isValidScore } from './nps.mjs';

function parseDateOnly(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function combineText(r) {
  const parts = [r.motivo_nota, r.comentario_completo].filter((x) => String(x ?? '').trim());
  return parts.join('\n\n').trim();
}

function pseudoResponseFromBase0(r) {
  const comment = combineText(r);
  if (!comment) return null;
  const d = parseDateOnly(r.data_resposta);
  return {
    response_id: r.dedupe_key ?? `base0-voc:${r.base_qv_id}:${d}:${r.nota}`,
    client_id: r.base_qv_id,
    client_name: r.nome_cliente ?? null,
    analytical_cycle_code: r.onda ?? `base0:${d?.slice(0, 4) ?? 'unknown'}`,
    analytical_cycle_name: r.onda ?? 'NPS passado',
    submitted_at: d ? `${d}T12:00:00.000Z` : null,
    score: isValidScore(r.nota) ? Number(r.nota) : null,
    nps_category: r.categoria ?? classifyNpsScore(r.nota),
    comment,
    program: r.programa ?? null,
    source: 'base0',
  };
}

function dedupeKey(r) {
  const d = parseDateOnly(r.submitted_at ?? r.data_resposta);
  return `${r.client_id}|${d}|${r.score ?? r.nota}`;
}

/**
 * Prepara VoC histórico a partir de base0.nps_respostas (somente leitura derivada).
 */
export function buildVocBase0Pack({ base0Nps = [], currentResponses = [], cycles = [], dataCutoff }) {
  const audit = {
    base0_nps_total: base0Nps.length,
    with_motivo_nota: 0,
    with_comentario_completo: 0,
    with_any_text: 0,
    unique_clients: 0,
    periods: [],
    dedupe_with_current: 0,
    classified_units: 0,
  };

  const currentKeys = new Set();
  for (const c of currentResponses) {
    if (!String(c.comment ?? '').trim()) continue;
    currentKeys.add(dedupeKey(c));
  }

  const pseudo = [];
  const clientSet = new Set();
  const periodSet = new Set();

  for (const r of base0Nps) {
    if (String(r.motivo_nota ?? '').trim()) audit.with_motivo_nota += 1;
    if (String(r.comentario_completo ?? '').trim()) audit.with_comentario_completo += 1;
    const row = pseudoResponseFromBase0(r);
    if (!row) continue;
    audit.with_any_text += 1;
    clientSet.add(row.client_id);
    if (row.analytical_cycle_code) periodSet.add(row.analytical_cycle_code);
    const dk = dedupeKey(row);
    if (currentKeys.has(dk)) {
      audit.dedupe_with_current += 1;
      continue;
    }
    pseudo.push(row);
  }

  audit.unique_clients = clientSet.size;
  audit.periods = [...periodSet].sort();

  const responseTopics = buildResponseTopicsRows(pseudo, { useRules: true });
  audit.classified_units = responseTopics.length;

  const pseudoCycles = [
    ...cycles,
    ...audit.periods.map((p) => ({ cycle_code: p, cycle_name: p })),
  ];

  const topicSummary = buildTopicSummaryDocument(responseTopics, pseudo, pseudoCycles, dataCutoff);

  return {
    audit,
    pseudoResponses: pseudo,
    responseTopics,
    topicSummary,
  };
}

export function mergeVocAllPeriods({ currentTopics = [], base0Topics = [], audit = {} }) {
  const seen = new Set(currentTopics.map((t) => t.response_id ?? t.input_hash).filter(Boolean));
  const merged = [...currentTopics];
  let skipped = 0;
  for (const t of base0Topics) {
    const id = t.response_id ?? t.input_hash;
    if (id && seen.has(id)) {
      skipped += 1;
      continue;
    }
    merged.push({ ...t, source: t.source ?? 'base0' });
    if (id) seen.add(id);
  }
  return {
    topics: merged,
    audit: { ...audit, voc_dedupe_skipped: skipped, voc_total: merged.length },
  };
}
