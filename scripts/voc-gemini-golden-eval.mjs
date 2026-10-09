#!/usr/bin/env node
import './load-dotenv.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyVocUnit } from '../lib/analytics/voc-unit-classifier.mjs';
import { loadVocAiConfig } from '../lib/analytics/voc-ai-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(readFileSync(join(root, 'data/quality/voc_gemini_golden_set.json'), 'utf8'));

async function main() {
  const cfg = loadVocAiConfig();
  let valenceOk = 0;
  let themeOk = 0;
  let evaluatedCases = 0;
  let expectationTotal = 0;
  const mismatches = [];

  for (const c of doc.cases) {
    if (c.expected_valence == null && !(c.also_expect?.length)) continue;
    evaluatedCases += 1;
    await new Promise((r) => setTimeout(r, 2200));
    const out = await classifyVocUnit(
      {
        response_id: c.id,
        score: c.score,
        nps_category: c.nps_category,
        question: c.question,
        answer: c.answer,
        candidate_themes: c.candidate_themes,
      },
      process.env,
    );
    const expectations = [
      { theme: c.expected_theme, valence: c.expected_valence },
      ...(c.also_expect ?? []),
    ].filter((e) => e.theme && e.valence);
    let caseOk = true;
    for (const exp of expectations) {
      expectationTotal += 1;
      const hit = out.classifications?.find((x) => x.theme === exp.theme);
      const vMatch = hit?.valence === exp.valence;
      const tMatch = Boolean(hit);
      if (vMatch) valenceOk += 1;
      else caseOk = false;
      if (tMatch && hit?.valence === exp.valence) themeOk += 1;
      else caseOk = false;
      if (!vMatch || !tMatch) {
        mismatches.push({
          id: c.id,
          expected: exp,
          got: hit
            ? {
                theme: hit.theme,
                valence: hit.valence,
                confidence: hit.confidence,
                semantic_conflict: hit.semantic_conflict,
              }
            : null,
          source: out.classifier_source,
          fallback: out.fallback_reason,
        });
      }
    }
    if (caseOk && expectations.length === 0) {
      /* skip counter for null expected */
    }
  }

  const report = {
    gemini_configured: cfg.geminiConfigured && cfg.useGemini,
    model: cfg.model,
    prompt_version: cfg.promptVersion,
    evaluated_cases: evaluatedCases,
    expectation_assertions: expectationTotal,
    valence_accuracy: expectationTotal ? Math.round((1000 * valenceOk) / expectationTotal) / 10 : null,
    theme_precision_approx: expectationTotal ? Math.round((1000 * themeOk) / expectationTotal) / 10 : null,
    mismatches,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(mismatches.length && cfg.geminiConfigured ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
