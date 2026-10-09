#!/usr/bin/env node
/** Casos obrigatórios A–G — Gemini real (prompt v3). */
import './load-dotenv.mjs';
import { classifyVocUnit } from '../lib/analytics/voc-unit-classifier.mjs';
import { loadVocAiConfig } from '../lib/analytics/voc-ai-config.mjs';

const CASES = [
  {
    id: 'A',
    question: 'Qual o principal motivo da sua nota?',
    answer: 'Até o presente momento não agregou em nada.',
    score: 4,
    nps_category: 'Detrator',
    candidate_themes: ['Valor percebido', 'Resultados', 'Expectativa'],
    expected: [{ theme: 'Valor percebido', valence: 'Negativa' }],
  },
  {
    id: 'B',
    question: 'O que poderíamos fazer para melhorar e merecer uma nota 9 ou 10?',
    answer: 'Precisa entregar o que prometeu.',
    score: 5,
    nps_category: 'Detrator',
    candidate_themes: ['Expectativa', 'Resultados', 'Confiança'],
    expected: [{ theme: 'Expectativa', valence: 'Negativa' }],
  },
  {
    id: 'C',
    question: 'Qual o principal motivo da sua nota?',
    answer: 'Tinha expectativas melhores sobre o investimento realizado no projeto.',
    score: 5,
    nps_category: 'Detrator',
    candidate_themes: ['Expectativa', 'Valor percebido', 'Resultados'],
    expected: [
      { theme: 'Expectativa', valence: 'Negativa' },
      { theme: 'Valor percebido', valence: 'Negativa' },
    ],
  },
  {
    id: 'D',
    question: 'Qual o principal motivo da sua nota?',
    answer: 'Não vejo a hora de terminar essa péssima experiência.',
    score: 2,
    nps_category: 'Detrator',
    candidate_themes: ['Expectativa', 'Atendimento / relacionamento', 'Valor percebido'],
    expected: [{ theme: 'Expectativa', valence: 'Negativa', altThemes: ['Atendimento / relacionamento', 'Valor percebido'] }],
  },
  {
    id: 'E',
    question: 'Qual o principal motivo da sua nota?',
    answer: 'Não tive resultado ainda.',
    score: 6,
    nps_category: 'Detrator',
    candidate_themes: ['Resultados', 'Valor percebido'],
    expected: [{ theme: 'Resultados', valence: 'Negativa' }],
  },
  {
    id: 'F',
    question: 'Qual o principal motivo da sua nota?',
    answer: 'Superou minhas expectativas.',
    score: 10,
    nps_category: 'Promotor',
    candidate_themes: ['Expectativa', 'Valor percebido'],
    expected: [{ theme: 'Expectativa', valence: 'Positiva' }],
  },
  {
    id: 'G',
    question: 'Qual o principal motivo da sua nota?',
    answer: 'Valeu muito o investimento.',
    score: 10,
    nps_category: 'Promotor',
    candidate_themes: ['Valor percebido', 'Resultados'],
    expected: [{ theme: 'Valor percebido', valence: 'Positiva' }],
  },
];

function matchesExpected(rows, exp) {
  const hit = rows.find((r) => r.theme === exp.theme);
  if (!hit) {
    if (exp.altThemes) {
      const alt = rows.find((r) => exp.altThemes.includes(r.theme) && r.valence === exp.valence);
      return alt ? { ok: true, row: alt } : { ok: false, reason: 'tema ausente' };
    }
    return { ok: false, reason: 'tema ausente' };
  }
  if (hit.valence !== exp.valence) return { ok: false, reason: `valência ${hit.valence}` };
  return { ok: true, row: hit };
}

async function main() {
  const cfg = loadVocAiConfig();
  const report = [];
  for (const c of CASES) {
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
    const rows = out.classifications ?? [];
    const checks = c.expected.map((e) => ({ ...e, ...matchesExpected(rows, e) }));
    report.push({
      case: c.id,
      text: c.answer,
      source: out.classifier_source,
      model: out.model,
      prompt_version: out.prompt_version,
      expected: c.expected,
      gemini: rows.map((r) => ({
        theme: r.theme,
        valence: r.valence,
        confidence: r.confidence,
        evidence: r.evidence,
        reason: r.valence_reason,
        semantic_conflict: r.semantic_conflict,
      })),
      ok: checks.every((x) => x.ok),
      checks,
    });
  }
  const valOk = report.filter((r) => r.ok).length;
  console.log(
    JSON.stringify(
      {
        prompt_version: cfg.promptVersion,
        gemini_configured: cfg.geminiConfigured && cfg.useGemini,
        mandatory_pass: `${valOk}/${CASES.length}`,
        report,
      },
      null,
      2,
    ),
  );
  process.exit(valOk === CASES.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
