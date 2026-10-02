import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyResponseValenceWithAi } from '../analytics/voc-ai-classifier.mjs';
import { loadVocAiConfig, createEmptyGeminiRunStats, VOC_GEMINI_PROMPT_VERSION } from '../analytics/voc-ai-config.mjs';
import { buildVocInputHash } from './voc-input-hash.mjs';
import { createVocPersistenceStore, needsHumanReview } from './voc-persistence-store.mjs';
import { loadVocDbMode } from './voc-db-config.mjs';
import { loadVocSourceMode } from './voc-source-config.mjs';
import { loadWorkItemsFromFile } from './voc-source-file.mjs';
import { loadWorkItemsFromBaseQv } from './voc-source-base-qv.mjs';
import { filterPendingWorkItems } from './voc-sync-pending.mjs';
import { serializeError } from './voc-supabase-errors.mjs';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

async function loadCandidateWorkItems({ sourceMode, projectRoot, store, env }) {
  if (sourceMode === 'base_qv') {
    const { workItems, meta } = await loadWorkItemsFromBaseQv({ store, env });
    return { workItems, sourceMeta: meta };
  }
  return {
    workItems: loadWorkItemsFromFile(projectRoot),
    sourceMeta: { source_mode: 'file' },
  };
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
  const env = opts.env ?? process.env;
  const dryRun = Boolean(opts.dryRun);
  const force = Boolean(opts.force);
  const limit = opts.limit != null && Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : null;
  const triggerType = opts.triggerType ?? 'scheduled';
  const log = opts.onStageLog ?? (() => {});

  const sourceMode = loadVocSourceMode(env);
  const dbMode = loadVocDbMode(env);
  log(1, `config loaded (VOC_SOURCE_MODE=${sourceMode}, ANALYTICS_NPS_DB_MODE=${dbMode})`);

  const store = await createVocPersistenceStore(env);
  const logInfo = store.logInfo();

  log(2, dbMode === 'postgres' ? 'validating analytics Postgres' : 'validating analytics PostgREST');
  await store.validateConnection();

  const activeVersion = await store.getActiveClassifierVersion();
  if (!activeVersion) {
    const err = new Error('ANALYTICS_MIGRATION_REQUIRED — nenhuma voc_classifier_versions ativa.');
    err.code = 'MIGRATION_REQUIRED';
    throw err;
  }

  const aiConfig = loadVocAiConfig(env);
  const classifierVersion = activeVersion.classifier_version;
  const promptVersion = activeVersion.prompt_version ?? VOC_GEMINI_PROMPT_VERSION;
  const model = aiConfig.model || activeVersion.model;

  log(3, `reading source (${sourceMode})`);
  const { workItems: candidates, sourceMeta } = await loadCandidateWorkItems({
    sourceMode,
    projectRoot: root,
    store,
    env,
  });

  log(4, 'discovering pending work items');
  const pendingAll = await filterPendingWorkItems(candidates, {
    store,
    classifierVersion,
    force,
    limit: null,
  });
  const slice = limit != null ? pendingAll.slice(0, limit) : pendingAll;

  if (dryRun) {
    const sample = slice[0] ?? pendingAll[0] ?? candidates[0];
    await store.close();
    return {
      ok: true,
      dry_run: true,
      source_mode: sourceMode,
      source_meta: sourceMeta,
      db_mode: dbMode,
      log_info: logInfo,
      classifier_version: classifierVersion,
      model,
      candidates: candidates.length,
      pending_found: pendingAll.length,
      work_items: slice.length,
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
      responses_found: pendingAll.length,
    };
  }

  log(5, 'creating run');
  const runId = await store.startClassificationRun({
    triggerType,
    provider: activeVersion.provider ?? 'gemini',
    requestedModel: model,
    promptVersion,
    classifierVersion,
  });

  const stats = createEmptyGeminiRunStats();
  const errors = [];
  const responsesFound = pendingAll.length;
  let responsesProcessed = 0;
  let geminiSuccess = 0;
  let rulesFallback = 0;
  let reviewQueue = 0;

  try {
    for (const item of slice) {
      log(6, `processing ${item.source_response_id}/${item.question_key}`);

      log(7, 'upserting response');
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

      log(8, 'checking cache');
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
        log(9, 'Gemini classification');
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
        log(10, `inserting classification ${row.topic}`);
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

        log(11, 'review queue');
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
      source_mode: sourceMode,
      source_meta: sourceMeta,
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
