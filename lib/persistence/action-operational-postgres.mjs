import { analyticsFrom } from './voc-supabase-store.mjs';
import { throwSupabaseError } from './voc-supabase-errors.mjs';

function caseKey(row) {
  return `${row.client_id}||${row.response_id ?? ''}||${row.cycle_code ?? ''}`;
}

function computeFinalPriority(caseRow) {
  if (caseRow.human_priority) return caseRow.human_priority;
  return caseRow.final_priority ?? caseRow.ai_priority ?? caseRow.hybrid_priority ?? null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function upsertActionCase(supabase, row) {
  const existing = await getActionCaseByKey(supabase, {
    client_id: row.client_id,
    response_id: row.response_id,
    cycle_code: row.cycle_code,
  });
  const human = row.human_priority ?? existing?.human_priority ?? null;
  const aiPriority = row.ai_priority ?? existing?.ai_priority ?? null;
  const hybrid = row.hybrid_priority ?? existing?.hybrid_priority ?? null;
  const payload = {
    client_id: row.client_id,
    response_id: row.response_id ?? null,
    cycle_code: row.cycle_code ?? null,
    source: row.source ?? existing?.source ?? 'action_queue',
    status: row.status ?? existing?.status ?? 'Novo',
    ai_priority: aiPriority,
    human_priority: human,
    hybrid_priority: hybrid,
    final_priority: human ?? row.final_priority ?? aiPriority ?? hybrid ?? existing?.final_priority ?? null,
    urgency: row.urgency ?? existing?.urgency ?? null,
    suggested_owner_area: row.suggested_owner_area ?? existing?.suggested_owner_area ?? null,
    action_category: row.action_category ?? existing?.action_category ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await analyticsFrom(supabase, 'action_cases')
    .upsert(payload, { onConflict: 'client_id,response_id,cycle_code' })
    .select('*')
    .single();
  if (error) throwSupabaseError('action_cases upsert', error);
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function getActionCaseByKey(supabase, { client_id, response_id, cycle_code }) {
  const { data, error } = await analyticsFrom(supabase, 'action_cases')
    .select('*')
    .eq('client_id', client_id)
    .eq('response_id', response_id ?? null)
    .eq('cycle_code', cycle_code ?? null)
    .maybeSingle();
  if (error) throwSupabaseError('action_cases select', error);
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function appendActionPlanHistory(supabase, actionCaseId, changeType, snapshot, changedBy) {
  const { error } = await analyticsFrom(supabase, 'action_plan_history').insert({
    action_case_id: actionCaseId,
    change_type: changeType,
    snapshot,
    changed_by: changedBy ?? null,
    changed_at: new Date().toISOString(),
  });
  if (error) throwSupabaseError('action_plan_history insert', error);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchActionPlanHistory(supabase, actionCaseId) {
  const { data, error } = await analyticsFrom(supabase, 'action_plan_history')
    .select('*')
    .eq('action_case_id', actionCaseId)
    .order('changed_at', { ascending: false });
  if (error) throwSupabaseError('action_plan_history select', error);
  return data ?? [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function upsertActionPlanRow(supabase, actionCaseId, body, identity) {
  const now = new Date().toISOString();
  const { data: existing } = await analyticsFrom(supabase, 'action_plans')
    .select('*')
    .eq('action_case_id', actionCaseId)
    .maybeSingle();

  const planPayload = {
    action_case_id: actionCaseId,
    client_id: body.client_id,
    response_id: body.response_id ?? null,
    cycle_code: body.cycle_code ?? null,
    objective: body.objective ?? existing?.objective ?? '',
    main_problem: body.main_problem ?? existing?.main_problem ?? '',
    action_text: body.action_text ?? body.action_proposal ?? existing?.action_text ?? '',
    responsible: body.responsible ?? existing?.responsible ?? '',
    due_date: body.due_date ?? existing?.due_date ?? null,
    status: body.status ?? existing?.status ?? 'Novo',
    success_criteria: body.success_criteria ?? existing?.success_criteria ?? '',
    notes: body.notes ?? existing?.notes ?? '',
    plan_origin: body.plan_source ?? body.plan_origin ?? existing?.plan_origin ?? 'manual',
    ai_suggestion_snapshot: body.ai_suggestion_snapshot ?? existing?.ai_suggestion_snapshot ?? null,
    updated_by: identity.email,
    updated_at: now,
  };

  if (!existing) {
    planPayload.created_by = identity.email;
    planPayload.created_at = now;
  }

  const { data, error } = await analyticsFrom(supabase, 'action_plans')
    .upsert(planPayload, { onConflict: 'action_case_id' })
    .select('*')
    .single();
  if (error) throwSupabaseError('action_plans upsert', error);

  await upsertActionCase(supabase, {
    client_id: body.client_id,
    response_id: body.response_id,
    cycle_code: body.cycle_code,
    status: planPayload.status,
  });

  return { plan: data, previous: existing };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function savePriorityReviewPostgres(supabase, body, identity) {
  const actionCase = await upsertActionCase(supabase, {
    client_id: body.client_id,
    response_id: body.response_id,
    cycle_code: body.cycle_code,
    human_priority: body.human_priority,
    urgency: body.urgency,
    suggested_owner_area: body.suggested_owner_area,
    action_category: body.action_category,
    ai_priority: body.previous_ai_priority ?? body.ai_priority ?? null,
  });

  const reviewedAt = new Date().toISOString();
  const { error: revErr } = await analyticsFrom(supabase, 'action_priority_reviews').insert({
    action_case_id: actionCase.id,
    client_id: body.client_id,
    response_id: body.response_id ?? null,
    previous_ai_priority: body.previous_ai_priority ?? body.ai_priority ?? null,
    human_priority: body.human_priority,
    urgency: body.urgency ?? null,
    suggested_owner_area: body.suggested_owner_area ?? null,
    action_category: body.action_category ?? null,
    review_reason: body.review_reason ?? null,
    reviewed_by: identity.email,
    reviewed_at: reviewedAt,
  });
  if (revErr) throwSupabaseError('action_priority_reviews insert', revErr);

  const priorityReview = {
    reviewed_by: identity.email,
    reviewed_by_name: identity.name,
    reviewed_at: reviewedAt,
    review_reason: body.review_reason ?? null,
    previous_ai_priority: body.previous_ai_priority ?? body.ai_priority ?? null,
  };

  await appendActionPlanHistory(
    supabase,
    actionCase.id,
    'priority_changed',
    {
      priority_review: priorityReview,
      human_priority: body.human_priority,
      previous_priority: body.previous_priority ?? body.previous_ai_priority ?? null,
    },
    identity.email,
  );

  return formatOverlayEntry(actionCase, null, priorityReview, []);
}

function formatOverlayEntry(actionCase, plan, priorityReview, historyRows) {
  const history = (historyRows ?? []).map((h) => ({
    type: h.change_type,
    at: h.changed_at,
    by: h.changed_by,
    snapshot: h.snapshot,
  }));

  return {
    client_id: actionCase.client_id,
    response_id: actionCase.response_id,
    cycle_code: actionCase.cycle_code,
    action_case_id: actionCase.id,
    human_priority: actionCase.human_priority,
    urgency: actionCase.urgency,
    suggested_owner_area: actionCase.suggested_owner_area,
    action_category: actionCase.action_category,
    ai_priority: actionCase.ai_priority,
    hybrid_priority: actionCase.hybrid_priority,
    final_priority: computeFinalPriority(actionCase),
    priority_review: priorityReview ?? null,
    plan: plan
      ? {
          objective: plan.objective,
          main_problem: plan.main_problem,
          action_text: plan.action_text,
          responsible: plan.responsible,
          due_date: plan.due_date,
          status: plan.status,
          success_criteria: plan.success_criteria,
          notes: plan.notes,
          plan_origin: plan.plan_origin,
          updated_by: plan.updated_by,
          updated_at: plan.updated_at,
        }
      : null,
    history,
  };
}

/**
 * Monta documento { entries } compatível com action_plans.json / frontend.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchOperationalPlansDocument(supabase) {
  const { data: cases, error: caseErr } = await analyticsFrom(supabase, 'action_cases').select('*');
  if (caseErr) throwSupabaseError('action_cases list', caseErr);

  const caseIds = (cases ?? []).map((c) => c.id);
  if (!caseIds.length) {
    return { updated_at: new Date().toISOString(), entries: [], source: 'postgres' };
  }

  const { data: plans, error: planErr } = await analyticsFrom(supabase, 'action_plans')
    .select('*')
    .in('action_case_id', caseIds);
  if (planErr) throwSupabaseError('action_plans list', planErr);

  const { data: history, error: histErr } = await analyticsFrom(supabase, 'action_plan_history')
    .select('*')
    .in('action_case_id', caseIds)
    .order('changed_at', { ascending: false });
  if (histErr) throwSupabaseError('action_plan_history list', histErr);

  const { data: reviews, error: revErr } = await analyticsFrom(supabase, 'action_priority_reviews')
    .select('*')
    .in('action_case_id', caseIds)
    .order('reviewed_at', { ascending: false });
  if (revErr) throwSupabaseError('action_priority_reviews list', revErr);

  const planByCase = new Map((plans ?? []).map((p) => [p.action_case_id, p]));
  const histByCase = new Map();
  for (const h of history ?? []) {
    if (!histByCase.has(h.action_case_id)) histByCase.set(h.action_case_id, []);
    histByCase.get(h.action_case_id).push(h);
  }
  const reviewByCase = new Map();
  for (const r of reviews ?? []) {
    if (!reviewByCase.has(r.action_case_id)) {
      reviewByCase.set(r.action_case_id, {
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        review_reason: r.review_reason,
        previous_ai_priority: r.previous_ai_priority,
      });
    }
  }

  const entries = (cases ?? []).map((c) =>
    formatOverlayEntry(c, planByCase.get(c.id) ?? null, reviewByCase.get(c.id) ?? null, histByCase.get(c.id) ?? []),
  );

  return {
    updated_at: new Date().toISOString(),
    source: 'postgres',
    entries,
  };
}

export { caseKey, computeFinalPriority };
