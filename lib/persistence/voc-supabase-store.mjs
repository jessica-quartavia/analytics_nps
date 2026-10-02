import { createClient } from '@supabase/supabase-js';
import { assertBusinessDataProject, loadBusinessDataSupabaseConfig } from './voc-supabase-config.mjs';
import { throwSupabaseError } from './voc-supabase-errors.mjs';

const LOW_CONFIDENCE = 0.65;
const REVIEW_MISMATCH_CONFIDENCE = 0.8;
export const ANALYTICS_SCHEMA = 'analytics_nps';

export function createBusinessDataAdminClient(env = process.env) {
  const config = loadBusinessDataSupabaseConfig(env);
  assertBusinessDataProject(config);
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: ANALYTICS_SCHEMA },
  });
}

/** Explicit schema chain (defense in depth vs default db.schema). */
export function analyticsFrom(supabase, table) {
  return supabase.schema(ANALYTICS_SCHEMA).from(table);
}

export async function getActiveClassifierVersion(supabase) {
  const { data, error } = await analyticsFrom(supabase, 'voc_classifier_versions')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwSupabaseError('voc_classifier_versions select', error, { stage: '3' });
  return data;
}

export async function startClassificationRun(supabase, { triggerType, provider, requestedModel, promptVersion, classifierVersion }) {
  const { data, error } = await analyticsFrom(supabase, 'voc_classification_runs')
    .insert({
      status: 'running',
      trigger_type: triggerType,
      provider,
      requested_model: requestedModel,
      effective_model: requestedModel,
      prompt_version: promptVersion,
      classifier_version: classifierVersion,
    })
    .select('id')
    .single();
  if (error) throwSupabaseError('voc_classification_runs insert', error, { stage: '3' });
  return data.id;
}

export async function finishClassificationRun(supabase, runId, patch) {
  if (!runId) return;
  const { error } = await analyticsFrom(supabase, 'voc_classification_runs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throwSupabaseError('voc_classification_runs update', error, { stage: '11' });
}

export async function upsertVocResponse(supabase, row) {
  const { data, error } = await analyticsFrom(supabase, 'voc_responses')
    .upsert(row, { onConflict: 'source_response_id,question_key' })
    .select('id, answer_hash')
    .single();
  if (error) throwSupabaseError('voc_responses upsert', error, { stage: '6' });
  return data;
}

export async function getAiCache(supabase, inputHash) {
  const { data, error } = await analyticsFrom(supabase, 'voc_ai_cache')
    .select('result')
    .eq('input_hash', inputHash)
    .maybeSingle();
  if (error) throwSupabaseError('voc_ai_cache select', error, { stage: '7' });
  return data?.result ?? null;
}

export async function touchAiCache(supabase, inputHash) {
  const { error } = await analyticsFrom(supabase, 'voc_ai_cache')
    .update({ last_used_at: new Date().toISOString() })
    .eq('input_hash', inputHash);
  if (error) throwSupabaseError('voc_ai_cache touch', error, { stage: '7' });
}

export async function upsertAiCache(supabase, row) {
  const { error } = await analyticsFrom(supabase, 'voc_ai_cache').upsert(row, { onConflict: 'input_hash' });
  if (error) throwSupabaseError('voc_ai_cache upsert', error, { stage: '7' });
}

export async function upsertClassification(supabase, row) {
  const { data, error } = await analyticsFrom(supabase, 'voc_classifications')
    .upsert(row, { onConflict: 'input_hash,topic,classifier_version' })
    .select('id, needs_human_review, valence, confidence')
    .single();
  if (error) throwSupabaseError('voc_classifications upsert', error, { stage: '9' });
  return data;
}

export function needsHumanReview({ confidence, npsCategory, valence }) {
  const c = confidence ?? 0;
  if (c < LOW_CONFIDENCE) return { needs: true, reason: 'low_confidence' };
  if (npsCategory === 'Promotor' && valence === 'Negativa' && c < REVIEW_MISMATCH_CONFIDENCE) {
    return { needs: true, reason: 'promotor_negative_low_confidence' };
  }
  if (npsCategory === 'Detrator' && valence === 'Positiva' && c < REVIEW_MISMATCH_CONFIDENCE) {
    return { needs: true, reason: 'detrator_positive_low_confidence' };
  }
  return { needs: false, reason: null };
}

export async function enqueueReviewIfNeeded(supabase, { classificationId, sourceResponseId, reason }) {
  if (!reason) return;
  const { data: pending, error: selErr } = await analyticsFrom(supabase, 'voc_review_queue')
    .select('id')
    .eq('classification_id', classificationId)
    .eq('status', 'pending')
    .maybeSingle();
  if (selErr) throwSupabaseError('voc_review_queue select', selErr, { stage: '10' });
  if (pending) return;
  const { error } = await analyticsFrom(supabase, 'voc_review_queue').insert({
    classification_id: classificationId,
    source_response_id: sourceResponseId,
    reason,
    status: 'pending',
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    throwSupabaseError('voc_review_queue insert', error, { stage: '10' });
  }
}
