import { loadVocDbMode, assertStoreEnvConfigured } from './voc-db-config.mjs';
import { createPostgresVocStore } from './voc-postgres-store.mjs';
import {
  createBusinessDataAdminClient,
  analyticsFrom,
  getActiveClassifierVersion as pgRestGetActive,
  startClassificationRun as pgRestStartRun,
  finishClassificationRun as pgRestFinishRun,
  upsertVocResponse as pgRestUpsertResponse,
  getAiCache as pgRestGetCache,
  touchAiCache as pgRestTouchCache,
  upsertAiCache as pgRestUpsertCache,
  upsertClassification as pgRestUpsertClassification,
  enqueueReviewIfNeeded as pgRestEnqueueReview,
} from './voc-supabase-store.mjs';
import { validateAnalyticsSupabaseConnection } from './voc-supabase-errors.mjs';
import { loadBusinessDataSupabaseConfig } from './voc-supabase-config.mjs';
import { throwSupabaseError } from './voc-supabase-errors.mjs';

export { needsHumanReview } from './voc-supabase-store.mjs';

/**
 * Uma execução = um store (postgres OU postgrest).
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function createVocPersistenceStore(env = process.env) {
  const mode = loadVocDbMode(env);
  assertStoreEnvConfigured(mode, env);

  if (mode === 'postgres') {
    return createPostgresVocStore(env);
  }

  const supabase = createBusinessDataAdminClient(env);
  const url = loadBusinessDataSupabaseConfig(env).url;
  let host = 'unknown';
  try {
    host = new URL(url).host;
  } catch {
    /* ignore */
  }

  return {
    mode: 'postgrest',
    logInfo() {
      return { mode: 'postgrest', host, connected: true };
    },
    async close() {},

    validateConnection: () => validateAnalyticsSupabaseConnection(supabase),
    getActiveClassifierVersion: () => pgRestGetActive(supabase),
    getExistingResponse: async (sourceResponseId, questionKey) => {
      const { data, error } = await analyticsFrom(supabase, 'voc_responses')
        .select('id, answer_hash')
        .eq('source_response_id', sourceResponseId)
        .eq('question_key', questionKey)
        .maybeSingle();
      if (error) throwSupabaseError('voc_responses select', error, { stage: '5' });
      return data;
    },
    hasClassificationForVersion: async (sourceResponseId, classifierVersion) => {
      const { data, error } = await analyticsFrom(supabase, 'voc_classifications')
        .select('id')
        .eq('source_response_id', sourceResponseId)
        .eq('classifier_version', classifierVersion)
        .limit(1);
      if (error) throwSupabaseError('voc_classifications select', error, { stage: '5' });
      return Boolean(data?.length);
    },
    upsertVocResponse: (row) => pgRestUpsertResponse(supabase, row),
    getClassificationByHash: async (inputHash, topic, classifierVersion) => {
      const { data, error } = await analyticsFrom(supabase, 'voc_classifications')
        .select('id, needs_human_review, valence, confidence')
        .eq('input_hash', inputHash)
        .eq('topic', topic)
        .eq('classifier_version', classifierVersion)
        .maybeSingle();
      if (error) throwSupabaseError('voc_classifications select', error);
      return data;
    },
    getAiCache: (inputHash) => pgRestGetCache(supabase, inputHash),
    touchAiCache: (inputHash) => pgRestTouchCache(supabase, inputHash),
    upsertAiCache: (row) => pgRestUpsertCache(supabase, row),
    upsertClassification: (row) => pgRestUpsertClassification(supabase, row),
    enqueueReviewIfNeeded: (args) => pgRestEnqueueReview(supabase, args),
    startClassificationRun: (args) => pgRestStartRun(supabase, args),
    finishClassificationRun: (runId, patch) => pgRestFinishRun(supabase, runId, patch),
    deleteRun: async (runId) => {
      const { error } = await analyticsFrom(supabase, 'voc_classification_runs').delete().eq('id', runId);
      if (error) throwSupabaseError('voc_classification_runs delete', error);
    },
  };
}
