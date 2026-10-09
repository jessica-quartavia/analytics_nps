#!/usr/bin/env node
/**
 * Reclassifica N clientes via Gemini (API local) + persiste Postgres + materializa JSON.
 * Uso: node scripts/voc-controlled-reclassify.mjs --limit=5
 */
import './load-dotenv.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocValenceUnits } from '../lib/analytics/voc-ai-segments.mjs';
import { classifyVocUnit } from '../lib/analytics/voc-unit-classifier.mjs';
import { loadVocAiConfig, VOC_GEMINI_CLASSIFIER_VERSION } from '../lib/analytics/voc-ai-config.mjs';
import { buildVocInputHash, buildAnswerHash } from '../lib/persistence/voc-input-hash.mjs';
import { createVocPersistenceStore } from '../lib/persistence/voc-persistence-store.mjs';
import { spawnSync } from 'node:child_process';
import {
  mergePostgresIntoResponseTopics,
  writeMaterializedVocBundle,
  loadJsonFile,
} from '../lib/analytics/voc-materialize-from-db.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function classifyWithGeminiRetry(input, env, { maxAttempts = 6, baseDelayMs = 4000 } = {}) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await classifyVocUnit(input, env);
    if (last.classifier_source === 'gemini') return last;
    const reason = last.fallback_reason ?? '';
    if (reason !== 'rate_limit' && reason !== 'timeout' && reason !== 'server_error') return last;
    const wait = Math.min(60_000, baseDelayMs * attempt);
    console.warn(`[voc-controlled] Gemini ${reason} — retry ${attempt}/${maxAttempts} em ${wait}ms`);
    await sleep(wait);
  }
  return last;
}

const TARGETS = [
  { label: 'Guilherme Almeida', match: (r) => (r.client_name ?? '').includes('Guilherme Almeida Francisco') },
  { label: 'Weslley', match: (r) => (r.client_name ?? '').includes('Weslley Gonçalves') },
  { label: 'Luiz Fernando', match: (r) => /Luiz Fernando Nascimento Benek|Luiz Fernando Rigotti/.test(r.client_name ?? '') },
  { label: 'neg_agregou', match: (r) => /não agregou em nada/i.test(r.comment ?? '') },
  { label: 'neg_entrega', match: (r) => /entregar o que prometeu/i.test(r.comment ?? '') },
];

function parseLimit() {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? Math.max(1, Number(arg.split('=')[1]) || 5) : 5;
}

function questionKey(question) {
  return String(question ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function main() {
  const limit = parseLimit();
  const cfg = loadVocAiConfig();
  const responses = JSON.parse(readFileSync(join(root, 'data/processed/responses.json'), 'utf8'));
  const picked = [];
  for (const t of TARGETS) {
    if (picked.length >= limit) break;
    const r = responses.find(t.match);
    if (r && !picked.some((p) => p.response_id === r.response_id)) picked.push({ ...t, response: r });
  }

  let store;
  try {
    store = await createVocPersistenceStore();
    await store.validateConnection();
    console.log('[voc-controlled] Persistência:', store.logInfo());
  } catch (e) {
    console.warn('[voc-controlled] Persistência indisponível — só classificação local:', e.message);
    store = null;
  }

  const processedIds = [];
  /** @type {Array<object>} */
  const localGeminiRows = [];
  for (const item of picked) {
    const r = item.response;
    processedIds.push(r.response_id);
    const { units } = buildVocValenceUnits(r.comment ?? '');
    console.log(`\n=== ${item.label} (${r.response_id}) ===`);
    for (const unit of units) {
      await sleep(3500);
      const out = await classifyWithGeminiRetry(
        {
          response_id: r.response_id,
          score: r.nps_score ?? r.score ?? null,
          nps_category: r.nps_category ?? null,
          question: unit.question,
          answer: unit.answer,
          candidate_themes: unit.candidate_themes,
        },
        process.env,
      );
      console.log(
        JSON.stringify({
          q: unit.question.slice(0, 60),
          source: out.classifier_source,
          model: out.model,
          prompt: out.prompt_version,
          rows: out.classifications,
        }),
      );

      if (out.classifier_source === 'gemini') {
        for (const c of out.classifications ?? []) {
          localGeminiRows.push({
            source_response_id: r.response_id,
            topic: c.theme,
            valence: c.valence,
            confidence: c.confidence,
            evidence: c.evidence,
            valence_reason: c.valence_reason ?? c.reason,
            classifier_source: 'gemini',
            ai_provider: cfg.provider,
            ai_model: cfg.model,
            prompt_version: cfg.promptVersion,
            classifier_version: VOC_GEMINI_CLASSIFIER_VERSION,
            needs_human_review: c.needs_human_review ?? false,
          });
        }
      }

      if (!store || out.classifier_source !== 'gemini') continue;

      const qk = questionKey(unit.question);
      const vocResp = await store.upsertVocResponse({
        source_response_id: r.response_id,
        client_id: r.client_id ?? null,
        analytical_cycle_code: r.analytical_cycle_code,
        score: r.nps_score ?? r.score ?? null,
        nps_category: r.nps_category ?? null,
        question_key: qk,
        question_text: unit.question,
        answer_text: unit.answer,
        answer_hash: buildAnswerHash({
          questionKey: qk,
          answerText: unit.answer,
          score: r.nps_score ?? r.score ?? null,
          npsCategory: r.nps_category ?? null,
        }),
        submitted_at: r.submitted_at ?? null,
        source_updated_at: new Date().toISOString(),
      });

      for (const c of out.classifications ?? []) {
        const inputHash = buildVocInputHash({
          question: unit.question,
          answer: unit.answer,
          candidateThemes: unit.candidate_themes,
          promptVersion: cfg.promptVersion,
          model: cfg.model,
          classifierVersion: VOC_GEMINI_CLASSIFIER_VERSION,
        });
        const saved = await store.upsertClassification({
          voc_response_id: vocResp.id,
          source_response_id: r.response_id,
          topic: c.theme,
          valence: c.valence,
          confidence: c.confidence,
          evidence: c.evidence,
          valence_reason: c.valence_reason ?? c.reason,
          classifier_source: 'gemini',
          ai_provider: cfg.provider,
          ai_model: cfg.model,
          prompt_version: cfg.promptVersion,
          classifier_version: VOC_GEMINI_CLASSIFIER_VERSION,
          input_hash: inputHash,
          needs_human_review: c.needs_human_review ?? false,
          fallback_reason: null,
        });
        if (saved?.needs_human_review || c.semantic_conflict) {
          await store.enqueueReviewIfNeeded({
            classificationId: saved.id,
            sourceResponseId: r.response_id,
            reason: c.semantic_conflict ? 'semantic_conflict' : 'low_confidence',
          });
        }
      }
    }
  }

  if (store) await store.close();

  const onlySet = new Set(processedIds);
  if (processedIds.length) {
    try {
      const r = spawnSync(
        process.execPath,
        [
          join(root, 'scripts/materialize-voc-from-postgres.mjs'),
          `--response-ids=${processedIds.join(',')}`,
        ],
        { cwd: root, stdio: 'inherit' },
      );
      if (r.status === 0) process.exit(0);
    } catch {
      /* fallback local merge */
    }
  }

  if (localGeminiRows.length && onlySet.size) {
    const responses = loadJsonFile(root, 'data/processed/responses.json');
    const cycles = loadJsonFile(root, 'data/processed/cycles.json');
    const cycleSummary = loadJsonFile(root, 'data/processed/cycle_summary.json');
    const existing = loadJsonFile(root, 'data/processed/response_topics.json');
    const responseById = new Map(responses.map((r) => [r.response_id, r]));
    const merged = mergePostgresIntoResponseTopics(existing, localGeminiRows, responseById, {
      onlyResponseIds: onlySet,
    });
    writeMaterializedVocBundle(root, {
      responseTopics: merged,
      responses,
      cycles,
      dataCutoff: cycleSummary.data_cutoff ?? new Date().toISOString(),
      onlyResponseIds: onlySet,
    });
    console.warn('[voc-controlled] Materialização local (Postgres indisponível ou merge remoto falhou).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
