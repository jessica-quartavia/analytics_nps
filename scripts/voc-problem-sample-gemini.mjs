#!/usr/bin/env node
/**
 * Reclassifica amostra problemática via classifyVocUnit (Gemini real, sem cache de arquivo).
 */
import './load-dotenv.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyVocUnit } from '../lib/analytics/voc-unit-classifier.mjs';
import { classifyCommentWithRules } from '../lib/analytics/voc-classifier.mjs';
import { OFFICIAL_TOPICS } from '../lib/analytics/voc-config.mjs';
import { loadVocAiConfig } from '../lib/analytics/voc-ai-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const responses = JSON.parse(readFileSync(join(root, 'data/processed/responses.json'), 'utf8'));
const topics = JSON.parse(readFileSync(join(root, 'data/processed/response_topics.json'), 'utf8'));
const byResponse = new Map();
for (const t of topics) {
  if (!byResponse.has(t.response_id)) byResponse.set(t.response_id, []);
  byResponse.get(t.response_id).push(t);
}

const CASES = [
  { key: 'A_nao_agregou', match: (r) => /não agregou em nada/i.test(r.comment ?? '') },
  { key: 'B_entregar', match: (r) => /entregar o que prometeu/i.test(r.comment ?? '') },
  { key: 'C_sem_resultado', match: (r) => /não tive resultado/i.test(r.comment ?? '') },
  { key: 'D_pessima', match: (r) => /péssima experiência|pessima experiencia/i.test(r.comment ?? '') },
  { key: 'E_transparencia', match: (r) => /Maior transparência|informações/i.test(r.comment ?? '') },
  { key: 'Weslley', match: (r) => (r.client_name ?? '').includes('Weslley') },
  { key: 'Guilherme_Almeida', match: (r) => (r.client_name ?? '').includes('Guilherme Almeida') },
  { key: 'Luiz_Fernando', match: (r) => (r.client_name ?? '').includes('Luiz Fernando Rigotti') },
];

function splitSegments(comment) {
  const text = String(comment ?? '').trim();
  const parts = text.split(/\n\n+/).filter(Boolean);
  if (parts.length <= 1) {
    return [{ question: '', answer: text, candidate_themes: [...OFFICIAL_TOPICS] }];
  }
  return parts.map((block) => {
    const m = block.match(/^([^:?]{8,200}[:?])\s*([\s\S]*)$/);
    if (m) {
      return { question: m[1].trim(), answer: m[2].trim(), candidate_themes: [...OFFICIAL_TOPICS] };
    }
    return { question: '', answer: block.trim(), candidate_themes: [...OFFICIAL_TOPICS] };
  });
}

async function classifyResponse(response) {
  const segments = splitSegments(response.comment);
  const geminiRows = [];
  for (const seg of segments) {
    if (!seg.answer) continue;
    const out = await classifyVocUnit(
      {
        response_id: response.response_id,
        score: response.nps_score ?? response.score ?? null,
        nps_category: response.nps_category ?? null,
        question: seg.question,
        answer: seg.answer,
        candidate_themes: seg.candidate_themes,
      },
      process.env,
    );
    for (const c of out.classifications ?? []) {
      geminiRows.push({ ...c, segment_question: seg.question, classifier_source: out.classifier_source, model: out.model });
    }
  }
  const rules = classifyCommentWithRules(response.comment ?? '', {
    npsScore: response.nps_score ?? response.score ?? null,
  });
  return { geminiRows, rules, unitMeta: loadVocAiConfig() };
}

async function main() {
  const report = [];
  for (const c of CASES) {
    const response = responses.find(c.match);
    if (!response) {
      report.push({ case: c.key, error: 'response_not_found' });
      continue;
    }
    const before = byResponse.get(response.response_id) ?? [];
    const { geminiRows, rules, unitMeta } = await classifyResponse(response);
    report.push({
      case: c.key,
      client_name: response.client_name,
      nps_category: response.nps_category,
      answer_excerpt: String(response.comment ?? '').slice(0, 320),
      before: before.map((t) => ({
        theme: t.topic,
        valence: t.valence,
        source: t.classification_source ?? t.classifier_source,
        evidence: t.evidence,
        reason: t.valence_reason,
      })),
      rules_v2_now: rules.map((t) => ({ theme: t.topic, valence: t.valence })),
      gemini_new: geminiRows,
      gemini_configured: unitMeta.geminiConfigured && unitMeta.useGemini,
      model: unitMeta.model,
      prompt_version: unitMeta.promptVersion,
      cause_hypothesis:
        before.every((t) => (t.classification_source ?? t.classifier_source) === 'rules_v2')
          ? 'A_rules_v2_static_bundle'
          : 'other',
    });
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
