import { analyticsFrom } from './voc-supabase-store.mjs';
import { throwSupabaseError } from './voc-supabase-errors.mjs';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function upsertActionClassification(supabase, row) {
  const record = {
    source_id: row.source_id,
    theme: row.theme ?? null,
    priority: row.priority ?? null,
    urgency: row.urgency ?? null,
    action_category: row.action_category ?? null,
    suggested_owner_area: row.suggested_owner_area ?? null,
    confidence: row.confidence ?? null,
    reason: row.reason ?? null,
    evidence: row.evidence ?? null,
    main_problem: row.main_problem ?? null,
    recommended_action: row.recommended_action ?? null,
    themes: row.themes ?? null,
    action_case_id: row.action_case_id ?? null,
    classifier_source: row.classifier_source ?? 'gemini',
    ai_provider: row.ai_provider ?? null,
    ai_model: row.ai_model ?? null,
    prompt_version: row.prompt_version,
    model: row.model ?? row.ai_model ?? null,
    input_hash: row.input_hash,
    needs_human_review: row.needs_human_review ?? false,
    fallback_reason: row.fallback_reason ?? null,
    classified_at: new Date().toISOString(),
  };

  const { data, error } = await analyticsFrom(supabase, 'action_classifications').upsert(record, {
    onConflict: 'source_id,input_hash,prompt_version',
  }).select('id').maybeSingle();

  if (error) throwSupabaseError('action_classifications upsert', error);
  return data;
}

export async function fetchActionClassificationsBySourceIds(supabase, sourceIds) {
  if (!sourceIds?.length) return [];
  const { data, error } = await analyticsFrom(supabase, 'action_classifications')
    .select('*')
    .in('source_id', sourceIds)
    .order('classified_at', { ascending: false });
  if (error) throwSupabaseError('action_classifications select', error);
  return data ?? [];
}
