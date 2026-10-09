import { upsertActionCase, appendActionPlanHistory } from './action-operational-postgres.mjs';
import { upsertActionClassification } from './action-postgres-store.mjs';

/**
 * Persiste enriquecimento (caso + classificação IA) sem sobrescrever revisão humana.
 */
export async function persistEnrichedActionRow(supabase, row) {
  const actionCase = await upsertActionCase(supabase, {
    client_id: row.client_id,
    response_id: row.response_id,
    cycle_code: row.cycle_code,
    ai_priority: row.ai_priority ?? null,
    hybrid_priority: row.hybrid_priority ?? null,
    final_priority: row.final_priority ?? row.display_priority ?? null,
    urgency: row.ai_urgency ?? null,
    suggested_owner_area: row.ai_suggested_owner_area ?? null,
    action_category: row.ai_action_category ?? null,
    human_priority: row.human_priority ?? undefined,
  });

  if (row.ai_classifier_source && row.response_id) {
    await upsertActionClassification(supabase, {
      source_id: row.response_id,
      theme: row.ai_theme,
      priority: row.ai_priority,
      urgency: row.ai_urgency,
      action_category: row.ai_action_category,
      suggested_owner_area: row.ai_suggested_owner_area,
      confidence: row.ai_confidence,
      reason: row.ai_reason,
      evidence: row.ai_evidence,
      main_problem: row.ai_main_problem,
      recommended_action: row.ai_recommended_action,
      themes: row.topics ?? null,
      action_case_id: actionCase.id,
      classifier_source: row.ai_classifier_source,
      ai_provider: row.ai_provider ?? 'gemini',
      ai_model: row.ai_model,
      prompt_version: row.ai_prompt_version,
      model: row.ai_model,
      input_hash: row.input_hash,
      needs_human_review: row.ai_needs_human_review ?? false,
      fallback_reason: row.ai_fallback_reason ?? null,
    });
    await appendActionPlanHistory(
      supabase,
      actionCase.id,
      'ai_classification',
      {
        ai_priority: row.ai_priority,
        ai_urgency: row.ai_urgency,
        classifier_source: row.ai_classifier_source,
        confidence: row.ai_confidence,
      },
      'system:gemini',
    );
  }

  return actionCase;
}
