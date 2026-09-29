/**
 * QA de falsos negativos VoC — compara baseline (response_topics.json) vs rules_v2 recomputado.
 * Gera data/quality/voc_false_negative_audit.json (não altera processed/).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResponseTopicsRows, classifyCommentWithRules } from '../lib/analytics/voc-classifier.mjs';
import { buildValenceChangeReport } from '../lib/analytics/voc-valence-impact.mjs';
import { VOC_CLASSIFIER_VERSION } from '../lib/analytics/voc-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const SET_CYCLE = 'NPS-2026-SET-PHARUS';
const responses = readJson('data/processed/responses.json');
const beforeRows = readJson('data/processed/response_topics.json');
const afterRows = buildResponseTopicsRows(responses, { useRules: true });

const responseById = new Map(responses.map((r) => [r.response_id, r]));
const beforeKey = (r) => `${r.response_id}\0${r.topic}`;
const afterMap = new Map(afterRows.map((r) => [`${r.response_id}\0${r.topic}`, r]));
const beforeMap = new Map(beforeRows.map((r) => [beforeKey(r), r]));

function promoterNegativeRows(rows, cycleCode) {
  return rows.filter((t) => {
    if (cycleCode && t.analytical_cycle_code !== cycleCode) return false;
    if (t.valence !== 'Negativa') return false;
    const r = responseById.get(t.response_id);
    return r && r.score != null && r.score >= 9;
  });
}

function enrichPromoterNegative(t, sourceLabel) {
  const r = responseById.get(t.response_id);
  const live = classifyCommentWithRules(r?.comment ?? '', { npsScore: r?.score ?? null });
  const mention = live.find((m) => m.topic === t.topic);
  return {
    source: sourceLabel,
    client_name: r?.client_name ?? '—',
    score: r?.score,
    analytical_cycle_code: t.analytical_cycle_code,
    question: extractQuestionForTopic(r?.comment, t.topic),
    answer: extractAnswerSnippet(r?.comment, mention?.matchIndex),
    theme: t.topic,
    valence: t.valence,
    confidence: t.confidence,
    valence_reason: t.valence_reason ?? mention?.valence_reason ?? null,
    matched_positive_cues: mention?.matched_positive_cues ?? [],
    matched_negative_cues: mention?.matched_negative_cues ?? [],
    decision_reason: mention?.valence_reason ?? t.valence_reason ?? 'stored_row',
  };
}

function extractAnswerSnippet(comment, matchIndex) {
  if (!comment || matchIndex == null) return '—';
  const norm = comment
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const rawNorm = comment
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const idx = rawNorm.indexOf(norm.slice(Math.min(matchIndex, norm.length)));
  const start = Math.max(0, (idx >= 0 ? idx : matchIndex) - 40);
  return comment.slice(start, start + 120).replace(/\s+/g, ' ').trim();
}

function extractQuestionForTopic(comment, topic) {
  if (!comment || !topic) return '—';
  const blocks = comment.split(/\n\s*\n/);
  const needle = String(topic).split('/')[0].trim().slice(0, 8).toLowerCase();
  for (const block of blocks) {
    if (block.includes(':') && block.toLowerCase().includes(needle)) {
      return block.split(':')[0].trim().slice(0, 120);
    }
  }
  const first = blocks[0]?.split(':')[0]?.trim();
  return first?.slice(0, 120) ?? '—';
}

/** Amostra prioritária para QA manual. */
function buildPrioritySample() {
  /** @type {Array<object>} */
  const sample = [];
  const seen = new Set();

  const pushCase = (label, row, extra = {}) => {
    const k = `${row.response_id}:${row.topic}:${label}`;
    if (seen.has(k)) return;
    seen.add(k);
    sample.push({ label, ...enrichPromoterNegative(row, 'after_v2'), ...extra });
  };

  for (const t of promoterNegativeRows(afterRows, null)) {
    pushCase('promotor_tema_negativo_pos_v2', t);
  }
  for (const t of promoterNegativeRows(beforeRows, SET_CYCLE)) {
    const after = afterMap.get(`${t.response_id}\0${t.topic}`);
    if (after && after.valence !== 'Negativa') {
      pushCase('corrigido_set2026', t, { valence_after: after.valence });
    }
  }

  for (const r of responses) {
    if (!r.comment) continue;
    const c = r.comment.toLowerCase();
    if (c.includes('nunca tinha pensado') || c.includes('nunca tinha participado')) {
      for (const m of classifyCommentWithRules(r.comment, { npsScore: r.score })) {
        pushCase('frase_nunca', { ...m, response_id: r.response_id, analytical_cycle_code: r.analytical_cycle_code, valence: m.valence, confidence: m.confidence, topic: m.topic });
      }
    }
    if (/\bter retornos\b|\bter retorno\b/i.test(c)) {
      for (const m of classifyCommentWithRules(r.comment, { npsScore: r.score })) {
        if (m.topic === 'Resultados' || m.topic === 'Expectativa') {
          pushCase('frase_ter_retornos', { ...m, response_id: r.response_id, analytical_cycle_code: r.analytical_cycle_code, valence: m.valence, confidence: m.confidence, topic: m.topic });
        }
      }
    }
    if (/continuar com a gente|o que te faria continuar/i.test(c)) {
      sample.push({
        label: 'pergunta_continuar',
        client_name: r.client_name,
        score: r.score,
        response_id: r.response_id,
        analytical_cycle_code: r.analytical_cycle_code,
        topics: classifyCommentWithRules(r.comment, { npsScore: r.score }).map((x) => ({
          topic: x.topic,
          valence: x.valence,
          reason: x.valence_reason,
        })),
      });
    }
  }

  return sample.slice(0, 500);
}

const impact = buildValenceChangeReport(beforeRows, afterRows);
const fernando = responses.find(
  (r) => r.client_name?.includes('Fernando Koboldt') && r.analytical_cycle_code === SET_CYCLE,
);
let fernandoBefore = [];
let fernandoAfter = [];
if (fernando) {
  fernandoBefore = beforeRows
    .filter((t) => t.response_id === fernando.response_id)
    .map((t) => ({ topic: t.topic, valence: t.valence, confidence: t.confidence }));
  fernandoAfter = classifyCommentWithRules(fernando.comment, { npsScore: fernando.score }).map((m) => ({
    topic: m.topic,
    valence: m.valence,
    confidence: m.confidence,
    valence_reason: m.valence_reason,
  }));
}

const report = {
  generated_at: new Date().toISOString(),
  classifier_baseline: 'response_topics.json (último materializado)',
  classifier_candidate: VOC_CLASSIFIER_VERSION,
  simulation: impact,
  promoter_negative: {
    set_2026_before: promoterNegativeRows(beforeRows, SET_CYCLE).length,
    set_2026_after: promoterNegativeRows(afterRows, SET_CYCLE).length,
    all_cycles_before: promoterNegativeRows(beforeRows, null).length,
    all_cycles_after: promoterNegativeRows(afterRows, null).length,
  },
  set_2026_promoter_negative_after: promoterNegativeRows(afterRows, SET_CYCLE).map((t) =>
    enrichPromoterNegative(t, 'after_v2'),
  ),
  set_2026_promoter_negative_before: promoterNegativeRows(beforeRows, SET_CYCLE).map((t) =>
    enrichPromoterNegative(t, 'before_file'),
  ),
  manual_case_fernando_koboldt: { before: fernandoBefore, after: fernandoAfter },
  priority_qa_sample: buildPrioritySample(),
};

const outPath = join(root, 'data/quality/voc_false_negative_audit.json');
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`VoC false-negative audit → ${outPath}`);
console.log(
  `Promotor+Negativa Set/2026: ${report.promoter_negative.set_2026_before} → ${report.promoter_negative.set_2026_after}`,
);
console.log(
  `Transições: ${impact.total_changed}/${impact.total_classifications_comparable} (${impact.pct_changed.toFixed(1)}%)`,
);
