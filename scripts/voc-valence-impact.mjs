/**
 * Simula impacto: baseline (response_topics.json) vs classificador candidato (rules_v2).
 * Não grava processed/ — só data/quality/voc_valence_impact.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResponseTopicsRows } from '../lib/analytics/voc-classifier.mjs';
import { buildValenceChangeReport } from '../lib/analytics/voc-valence-impact.mjs';
import { VOC_CLASSIFIER_VERSION } from '../lib/analytics/voc-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const responses = readJson('data/processed/responses.json');
const before = readJson('data/processed/response_topics.json');
const after = buildResponseTopicsRows(responses, { useRules: true });

const report = buildValenceChangeReport(before, after);
report.classifier_baseline = 'response_topics.json';
report.classifier_candidate = VOC_CLASSIFIER_VERSION;
report.manual_cases = {};

const responseById = new Map(responses.map((r) => [r.response_id, r]));
function countPromoterNegative(rows, cycleCode) {
  return rows.filter((t) => {
    if (cycleCode && t.analytical_cycle_code !== cycleCode) return false;
    if (t.valence !== 'Negativa') return false;
    const r = responseById.get(t.response_id);
    return r && r.score >= 9;
  }).length;
}
report.promoter_negative = {
  set_2026_before: countPromoterNegative(before, 'NPS-2026-SET-PHARUS'),
  set_2026_after: countPromoterNegative(after, 'NPS-2026-SET-PHARUS'),
};

const ADEMIR_ID = '1627226c-5ed5-4614-9c67-029bfc392dcd';
const ademirComment = responses.find((r) => r.response_id === ADEMIR_ID)?.comment;
if (ademirComment) {
  const { classifyCommentWithRules } = await import('../lib/analytics/voc-classifier.mjs');
  report.manual_cases.ademir_barioni = {
    before: before.filter((r) => r.response_id === ADEMIR_ID).map((r) => ({ topic: r.topic, valence: r.valence })),
    after: classifyCommentWithRules(ademirComment, { npsScore: 10 }).map((r) => ({
      topic: r.topic,
      valence: r.valence,
    })),
  };
}

const lenis = responses.find((r) => (r.client_name ?? '').includes('Lenis Laura'));
if (lenis) {
  const { classifyCommentWithRules } = await import('../lib/analytics/voc-classifier.mjs');
  report.manual_cases.lenis_laura = {
    before: before.filter((r) => r.response_id === lenis.response_id).map((r) => ({ topic: r.topic, valence: r.valence })),
    after: classifyCommentWithRules(lenis.comment, { npsScore: lenis.score }).map((r) => ({
      topic: r.topic,
      valence: r.valence,
    })),
  };
}

const outPath = join(root, 'data/quality/voc_valence_impact.json');
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`VoC valence impact — ${report.total_changed}/${report.total_classifications_comparable} alteradas (${report.pct_changed.toFixed(1)}%)`);
console.log(`Relatório: ${outPath}`);
