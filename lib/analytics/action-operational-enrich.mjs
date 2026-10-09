import { enrichEntryWithHybridPriority } from './action-priority-hybrid.mjs';
import { classifyActionUnit } from './action-unit-classifier.mjs';
import { isActionGeminiRequired } from './action-ai-config.mjs';

/**
 * Aplica classificação IA (ou fallback) + prioridade híbrida ao item da fila.
 */
export async function enrichActionEntryOperational(entry, { classify = true, env } = {}) {
  let aiFields = {};
  if (classify && entry.response_id) {
    const result = await classifyActionUnit(
      {
        source_id: entry.response_id,
        response_id: entry.response_id,
        client_id: entry.client_id,
        client_name: entry.client_name,
        cycle_code: entry.cycle_code,
        previous_score: entry.previous_score,
        current_score: entry.current_score,
        score_delta: entry.score_delta,
        nps_migration: entry.nps_migration,
        priority: entry.priority,
        reason: entry.reason,
        comment: entry.comment,
        topics: entry.topics,
        primary_topic: entry.primary_topic,
        critical_flag: entry.critical_flag,
        current_category: entry.current_category,
        previous_category: entry.previous_category,
      },
      env,
    );
    if (!result.ok) {
      if (isActionGeminiRequired(env)) {
        throw new Error(result.error ?? result.code ?? 'Classificação Gemini falhou');
      }
    } else if (result.ok && result.classification) {
      if (isActionGeminiRequired(env) && result.classifier_source !== 'gemini') {
        throw new Error(
          `ACTION_REQUIRE_GEMINI: recebido ${result.classifier_source ?? 'unknown'} em vez de gemini`,
        );
      }
      const c = result.classification;
      aiFields = {
        ai_theme: c.theme,
        ai_priority: c.priority,
        ai_urgency: c.urgency,
        ai_action_category: c.action_category,
        ai_suggested_owner_area: c.suggested_owner_area,
        ai_confidence: c.confidence,
        ai_reason: c.reason,
        ai_evidence: c.evidence,
        ai_main_problem: c.main_problem ?? c.theme,
        ai_recommended_action: c.recommended_action ?? null,
        ai_classifier_source: result.classifier_source,
        ai_model: result.model,
        ai_prompt_version: result.prompt_version,
        ai_classified_at: new Date().toISOString(),
        ai_needs_human_review: result.needs_human_review ?? false,
        input_hash: result.input_hash ?? null,
        ai_fallback_reason: result.fallback_reason ?? null,
      };
    }
  }

  const merged = enrichEntryWithHybridPriority({ ...entry, ...aiFields });
  return {
    ...merged,
    display_priority: merged.final_priority ?? merged.hybrid_priority ?? merged.priority,
    plan_status: entry.plan_status ?? entry.status ?? 'Novo',
  };
}

export function mergeOperationalOverlay(entry, overlay) {
  if (!overlay) return entry;
  const human = overlay.human_priority ?? null;
  const plan = overlay.plan ?? null;
  return {
    ...entry,
    human_priority: human,
    final_priority: human ?? entry.hybrid_priority ?? entry.ai_priority ?? entry.final_priority,
    display_priority: human ?? entry.hybrid_priority ?? entry.ai_priority ?? entry.final_priority,
    priority_review: overlay.priority_review ?? null,
    plan: plan ?? entry.plan ?? null,
    plan_status: plan?.status ?? entry.plan_status ?? entry.status ?? 'Novo',
    plan_objective: plan?.objective ?? entry.plan_objective ?? null,
    plan_responsible: plan?.responsible ?? entry.owner ?? null,
    plan_due_date: plan?.due_date ?? null,
    action_case_id: overlay.action_case_id ?? entry.action_case_id ?? null,
    history: overlay.history ?? entry.history ?? [],
  };
}
