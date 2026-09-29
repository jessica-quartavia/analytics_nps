/**
 * Simula impacto da revisão rules_v1 antes de regenerar response_topics.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResponseTopicsRows } from '../lib/analytics/voc-classifier.mjs';
import { buildValenceChangeReport } from '../lib/analytics/voc-valence-impact.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const responses = readJson('data/processed/responses.json');
const before = readJson('data/processed/response_topics.json');
const after = buildResponseTopicsRows(responses, { useRules: true });

const report = buildValenceChangeReport(before, after);
report.manual_cases = {};

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
