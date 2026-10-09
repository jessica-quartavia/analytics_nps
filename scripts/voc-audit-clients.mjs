#!/usr/bin/env node
/** Before/after audit for named clients (dashboard vs Gemini fresh). */
import './load-dotenv.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocValenceUnits } from '../lib/analytics/voc-ai-segments.mjs';
import { classifyVocUnit } from '../lib/analytics/voc-unit-classifier.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLIENTS = [
  { name: 'Guilherme Almeida Francisco', match: (r) => (r.client_name ?? '').includes('Guilherme Almeida Francisco') },
  { name: 'Weslley Gonçalves Cintra', match: (r) => (r.client_name ?? '').includes('Weslley Gonçalves') },
  { name: 'Luiz Fernando', match: (r) => /Luiz Fernando Nascimento Benek|Luiz Fernando Rigotti/.test(r.client_name ?? '') },
];

async function main() {
  const responses = JSON.parse(readFileSync(join(root, 'data/processed/responses.json'), 'utf8'));
  const topics = JSON.parse(readFileSync(join(root, 'data/processed/response_topics.json'), 'utf8'));
  const byResp = new Map();
  for (const t of topics) {
    if (!byResp.has(t.response_id)) byResp.set(t.response_id, []);
    byResp.get(t.response_id).push(t);
  }

  const report = [];
  for (const c of CLIENTS) {
    const r = responses.find(c.match);
    if (!r) {
      report.push({ client: c.name, error: 'not_found' });
      continue;
    }
    const before = byResp.get(r.response_id) ?? [];
    const geminiRows = [];
    const { units } = buildVocValenceUnits(r.comment ?? '');
    for (const u of units) {
      await sleep(2500);
      const out = await classifyVocUnit(
        {
          response_id: r.response_id,
          score: r.nps_score ?? r.score ?? null,
          nps_category: r.nps_category ?? null,
          question: u.question,
          answer: u.answer,
          candidate_themes: u.candidate_themes,
        },
        process.env,
      );
      for (const row of out.classifications ?? []) {
        geminiRows.push({
          ...row,
          classifier_source: out.classifier_source,
          model: out.model,
          prompt_version: out.prompt_version,
          segment_q: u.question.slice(0, 80),
        });
      }
    }
    report.push({
      client: c.name,
      response_id: r.response_id,
      nps: r.nps_score ?? r.score,
      nps_category: r.nps_category,
      comparison: before.map((b) => {
        const g =
          geminiRows.find((x) => x.theme === b.topic) ??
          geminiRows.find((x) => b.topic === 'Engenheiro Patrimonial' && x.theme === b.topic);
        return {
          theme: b.topic,
          valence_dashboard: b.valence,
          source_dashboard: b.classification_source ?? b.classifier_source,
          prompt_dashboard: b.prompt_version ?? null,
          valence_gemini_new: g?.valence ?? null,
          confidence: g?.confidence ?? null,
          evidence: g?.evidence ?? null,
          reason: g?.valence_reason ?? g?.reason ?? null,
          gemini_source: g?.classifier_source ?? null,
          prompt_gemini: g?.prompt_version ?? null,
          semantic_conflict: g?.semantic_conflict ?? false,
        };
      }),
      gemini_all: geminiRows,
    });
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
