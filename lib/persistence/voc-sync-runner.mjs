import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocValenceUnits } from '../analytics/voc-ai-segments.mjs';
import { classifyResponseValenceWithAi } from '../analytics/voc-ai-classifier.mjs';
import { loadVocAiConfig, createEmptyGeminiRunStats, VOC_GEMINI_PROMPT_VERSION } from '../analytics/voc-ai-config.mjs';
import { buildAnswerHash, buildVocInputHash } from './voc-input-hash.mjs';
import { createVocPersistenceStore, needsHumanReview } from './voc-persistence-store.mjs';
import { loadVocDbMode } from './voc-db-config.mjs';
import { serializeError } from './voc-supabase-errors.mjs';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

function questionKey(question) {
  const q = String(question ?? '').trim().slice(0, 120);
  return Buffer.from(q || 'segment').toString('base64url').slice(0, 48);
}

function loadResponses(root) {
  return JSON.parse(readFileSync(join(root, 'data/processed/responses.json'), 'utf8'));
}

function expandResponseRows(response) {
  const comment = response.comment?.trim();
  if (!comment) return [];
  const { units } = buildVocValenceUnits(comment);
  return units.map((u, idx) => ({
    source_response_id: response.response_id,
    client_id: response.client_id ?? null,
    analytical_cycle_code: response.analytical_cycle_code ?? null,
    score: response.score ?? null,
    nps_category: response.nps_category ?? null,
    question_key: questionKey(u.question) || `seg_${idx}`,
    question_text: u.question,
    answer_text: u.answer,
    answer_hash: buildAnswerHash({
      questionKey: questionKey(u.question),
      answerText: u.answer,
      score: response.score,
      npsCategory: response.nps_category,
    }),
    submitted_at: response.submitted_at ?? null,
    source_updated_at: response.updated_at ?? null,
    unit: u,
    response,
  }));
}

/**
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.force]
 * @param {'scheduled'|'manual'|'reprocess'} [opts.triggerType]
 * @param {string} [opts.projectRoot]
 * @param {(n: number, msg: string) => void} [opts.onStageLog]
 * @param {NodeJS.ProcessEnv} [opts.env]
 */
export async function runVocIncrementalSync(opts = {}) {
  const root = opts.projectRoot ?? defaultRoot;
  const dryRun = Boolean(opts.dryRun);
  const force = Boolean(opts.force);
  const limit = opts.limit != null && Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : null;
  const triggerType = opts.triggerType ?? 'scheduled';
  const log = opts.onStageLog ?? (() => {});

  const dbMode = loadVocDbMode(opts.env);
  log(1, `config loaded (ANALYTICS_NPS_DB_MODE=${dbMode})`);

  const store = await createVocPersistenceStore(opts.env);
  const logInfo = store.logInfo();

  log(2, dbMode === 'postgres' ? 'validating analytics Postgres' : 'validating analytics PostgREST');
  await store.validateConnection();

  const activeVersion = await store.getActiveClassifierVersion();
  if (!activeVersion) {
    const err = new Error('ANALYTICS_MIGRATION_REQUIRED — nenhuma voc_classifier_versions ativa.');
    err.code = 'MIGRATION_REQUIRED';
    throw err;
  }

  const aiConfig = loadVocAiConfig(opts.env);
  const classifierVersion = activeVersion.classifier_version;
  const promptVersion = activeVersion.prompt_version ?? VOC_GEMINI_PROMPT_VERSION;
  const model = aiConfig.model || activeVersion.model;

  log(3, 'reading source responses');
  const responses = loadResponses(root);
  const workItems = [];
  for (const r of responses) {
    workItems.push(...expandResponseRows(r));
  }
  const slice = limit != null ? workItems.slice(0, limit) : workItems;

  if (dryRun) {
    const sample = slice[0];
    await store.close();
    return {
      ok: true,
      dry_run: true,
      db_mode: dbMode,
      log_info: logInfo,
      classifier_version: classifierVersion,
      model,
      work_items: workItems.length,
      sample: sample
        ? {
            source_response_id: sample.source_response_id,
            question_key: sample.question_key,
            answer_hash: sample.answer_hash,
            input_hash: buildVocInputHash({
              question: sample.question_text,
              answer: sample.answer_text,
              candidateThemes: sample.unit.candidate_themes,
              promptVersion,
              model,
              classifierVersion,
            }),
          }
        : null,
      processed: 0,
      gemini: 0,
      fallback: 0,
      review_queue: 0,
      run_id: null,
    };
  }

  log(4, 'creating run');
  const runId = await store.startClassificationRun({
    triggerType,
    provider: activeVersion.provider ?? 'gemini',
    requestedModel: model,
    promptVersion,
    classifierVersion,
  });

  const stats = createEmptyGeminiRunStats();
  const errors = [];
  let responsesFound = workItems.length;
  let responsesProcessed = 0;
  let geminiSuccess = 0;
  let rulesFallback = 0;
  let reviewQueue = 0;

  try {
    for (const item of slice) {
      log(5, `checking existing voc_responses ${item.source_response_id}/${item.question_key}`);
      const existing = await store.getExistingResponse(item.source_response_id, item.question_key);

      const hashChanged = existing?.answer_hash !== item.answer_hash;
      const isNew = !existing;
      if (!force && !isNew && !hashChanged) {
        const hasCls = await store.hasClassificationForVersion(item.source_response_id, classifierVersion);
        if (hasCls) continue;
      }

      log(6, 'upserting response');
      const vocRow = await store.upsertVocResponse({
        source_response_id: item.source_response_id,
        client_id: item.client_id,
        analytical_cycle_code: item.analytical_cycle_code,
        score: item.score,
        nps_category: item.nps_category,
        question_key: item.question_key,
        question_text: item.question_text,
        answer_text: item.answer_text,
        answer_hash: item.answer_hash,
        submitted_at: item.submitted_at,
        source_updated_at: item.source_updated_at,
      });

      responsesProcessed += 1;

      const inputHash = buildVocInputHash({
        question: item.question_text,
        answer: item.answer_text,
        candidateThemes: item.unit.candidate_themes,
        promptVersion,
        model,
        classifierVersion,
      });

      log(7, 'checking cache');
      let cached = await store.getAiCache(inputHash);
      if (cached) {
        await store.touchAiCache(inputHash);
        stats.cache_hits += 1;
      }

      /** @type {Array<object>} */
      let topicRows;
      if (cached?.classifications) {
        topicRows = cached.classifications.map((c) => ({
          topic: c.theme,
          valence: c.valence,
          confidence: c.confidence,
          evidence: c.evidence,
          valence_reason: c.reason,
          classifier_source: 'gemini',
          ai_provider: 'gemini',
          ai_model: model,
        }));
        geminiSuccess += 1;
      } else {
        log(8, 'Gemini classification');
        const rows = await classifyResponseValenceWithAi(item.response, {
          config: aiConfig,
          stats,
          skipNetwork: !aiConfig.geminiConfigured || !aiConfig.useGemini,
        });
        topicRows = rows;
        if (rows.some((r) => r.classifier_source === 'gemini')) {
          geminiSuccess += 1;
          const geminiPayload = {
            classifications: rows
              .filter((r) => r.classifier_source === 'gemini')
              .map((r) => ({
                theme: r.topic,
                valence: r.valence,
                confidence: r.confidence,
                evidence: r.evidence,
                reason: r.valence_reason,
              })),
          };
          await store.upsertAiCache({
            input_hash: inputHash,
            question_text: item.question_text,
            answer_text: item.answer_text,
            candidate_themes: item.unit.candidate_themes,
            provider: 'gemini',
            model,
            prompt_version: promptVersion,
            classifier_version: classifierVersion,
            result: geminiPayload,
          });
        } else {
          rulesFallback += 1;
        }
      }

      for (const row of topicRows) {
        log(9, `inserting classification ${row.topic}`);
        const review = needsHumanReview({
          confidence: row.confidence,
          npsCategory: item.nps_category,
          valence: row.valence,
        });
        if (review.needs) reviewQueue += 1;

        const saved = await store.upsertClassification({
          voc_response_id: vocRow.id,
          source_response_id: item.source_response_id,
          topic: row.topic,
          valence: row.valence,
          confidence: row.confidence,
          evidence: row.evidence,
          valence_reason: row.valence_reason,
          classifier_source: row.classifier_source,
          ai_provider: row.ai_provider ?? null,
          ai_model: row.ai_model ?? null,
          prompt_version: promptVersion,
          classifier_version: classifierVersion,
          input_hash: inputHash,
          needs_human_review: review.needs,
          fallback_reason: row.fallback_reason ?? null,
        });

        log(10, 'review queue');
        if (review.reason) {
          await store.enqueueReviewIfNeeded({
            classificationId: saved.id,
            sourceResponseId: item.source_response_id,
            reason: review.reason,
          });
        }
      }
    }

    const pending = responsesProcessed;
    const errorRate = pending ? (stats.failed ?? 0) / pending : 0;
    let status = 'success';
    if (errorRate > 0.2 || (aiConfig.useGemini && geminiSuccess === 0 && responsesProcessed > 0)) {
      status = 'partial';
    }
    if (stats.failed > responsesProcessed) status = 'failed';

    log(11, 'finishing run');
    await store.finishClassificationRun(runId, {
      status,
      responses_found: responsesFound,
      responses_processed: responsesProcessed,
      gemini_success: geminiSuccess,
      rules_fallback: rulesFallback,
      low_confidence: reviewQueue,
      http_429: stats.rate_limit ?? 0,
      http_503: 0,
      timeouts: stats.timeout ?? 0,
      invalid_outputs: stats.invalid_json ?? 0,
      errors,
    });

    await store.close();

    return {
      ok: status === 'success' || status === 'partial',
      status,
      db_mode: dbMode,
      log_info: logInfo,
      processed: responsesProcessed,
      gemini: geminiSuccess,
      fallback: rulesFallback,
      review_queue: reviewQueue,
      run_id: runId,
      responses_found: responsesFound,
      stats,
    };
  } catch (err) {
    errors.push({ message: err?.message ?? serializeError(err) });
    try {
      await store.finishClassificationRun(runId, {
        status: 'failed',
        responses_found: responsesFound,
        responses_processed: responsesProcessed,
        errors,
      });
    } catch {
      /* ignore finish failure */
    }
    await store.close();
    throw err;
  }
}
