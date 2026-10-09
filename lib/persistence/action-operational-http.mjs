import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveReviewerIdentity } from '../auth/dashboard-session-audit.mjs';
import { createBusinessDataAdminClient } from './voc-supabase-store.mjs';
import { serializeError } from './voc-supabase-errors.mjs';
import {
  fetchOperationalPlansDocument,
  savePriorityReviewPostgres,
  upsertActionCase,
  upsertActionPlanRow,
  appendActionPlanHistory,
  getActionCaseByKey,
} from './action-operational-postgres.mjs';
import { writeActionPlansJsonSnapshot } from './action-operational-snapshot.mjs';
import { suggestActionPlanForCase } from '../analytics/action-plan-fallback.mjs';
import { appendPortalAuditEvent } from './portal-audit-log.mjs';
import { insertSystemAuditEvent } from './system-audit-log.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANS_PATH = join(ROOT, 'data/operational/action_plans.json');

function loadPlansJsonFallback() {
  if (!existsSync(PLANS_PATH)) {
    return { updated_at: null, entries: [], source: 'json_fallback' };
  }
  return { ...JSON.parse(readFileSync(PLANS_PATH, 'utf8')), source: 'json_fallback' };
}

function usePostgresPrimary(env) {
  if (env.ACTION_OPERATIONAL_USE_JSON === '1' || env.ACTION_OPERATIONAL_USE_JSON === 'true') {
    return false;
  }
  return Boolean(createBusinessDataAdminClient(env));
}

async function loadPlansDoc(env) {
  if (!usePostgresPrimary(env)) return loadPlansJsonFallback();
  try {
    const supabase = createBusinessDataAdminClient(env);
    const doc = await fetchOperationalPlansDocument(supabase);
    writeActionPlansJsonSnapshot(doc);
    return doc;
  } catch (err) {
    console.error('[action-operational] Postgres read failed, JSON fallback:', serializeError(err));
    return loadPlansJsonFallback();
  }
}

async function persistAndSnapshot(env, mutator) {
  if (!usePostgresPrimary(env)) {
    return { entry: mutator.jsonOnly?.(), storage: 'json' };
  }
  const supabase = createBusinessDataAdminClient(env);
  const entry = await mutator.postgres(supabase);
  const doc = await fetchOperationalPlansDocument(supabase);
  writeActionPlansJsonSnapshot(doc);
  return { entry, storage: 'postgres', doc };
}

function entryKey(e) {
  return `${e.client_id}||${e.response_id ?? ''}||${e.cycle_code ?? ''}`;
}

/** Fallback JSON write (dev sem Postgres). */
function savePlansJsonLegacy(body, action, identity) {
  const doc = loadPlansJsonFallback();
  doc.entries = doc.entries ?? [];
  const key = entryKey(body);
  let entry = doc.entries.find((e) => entryKey(e) === key);
  if (!entry) {
    entry = { client_id: body.client_id, response_id: body.response_id, cycle_code: body.cycle_code, history: [] };
    doc.entries.push(entry);
  }
  if (action === 'priority_review') {
    entry.human_priority = body.human_priority;
    entry.urgency = body.urgency ?? entry.urgency;
    entry.suggested_owner_area = body.suggested_owner_area ?? entry.suggested_owner_area;
    entry.action_category = body.action_category ?? entry.action_category;
    entry.priority_review = {
      reviewed_by: identity.email,
      reviewed_by_name: identity.name,
      reviewed_at: new Date().toISOString(),
      review_reason: body.review_reason ?? null,
      previous_ai_priority: body.previous_ai_priority ?? entry.ai_priority ?? null,
    };
    entry.history = entry.history ?? [];
    entry.history.push({ type: 'priority_review', at: entry.priority_review.reviewed_at, by: identity.email });
  } else if (action === 'save_plan') {
    const prev = entry.plan ?? {};
    const isNew = !prev.updated_at;
    entry.plan = {
      objective: body.objective ?? prev.objective ?? '',
      main_problem: body.main_problem ?? prev.main_problem ?? '',
      action_text: body.action_text ?? body.action_proposal ?? prev.action_text ?? '',
      responsible: body.responsible ?? prev.responsible ?? '',
      due_date: body.due_date ?? prev.due_date ?? null,
      status: body.status ?? prev.status ?? 'Novo',
      success_criteria: body.success_criteria ?? prev.success_criteria ?? '',
      notes: body.notes ?? prev.notes ?? '',
      plan_origin: body.plan_source ?? body.plan_origin ?? prev.plan_origin ?? 'manual',
      updated_by: identity.email,
      updated_at: new Date().toISOString(),
    };
    entry.history.push({
      type: isNew ? 'action_plan_created' : 'action_plan_updated',
      at: entry.plan.updated_at,
      by: identity.email,
      snapshot: { previous: prev, plan: entry.plan },
    });
  }
  writeActionPlansJsonSnapshot(doc);
  return entry;
}

export async function executeActionOperationalHttpRequest(input) {
  const path = input.path ?? '';
  const method = input.method ?? 'GET';
  const env = input.env ?? process.env;

  if (path.endsWith('/health') && method === 'GET') {
    return {
      status: 200,
      body: {
        ok: true,
        service: 'action-operational',
        storage: usePostgresPrimary(env) ? 'postgres' : 'json',
      },
    };
  }

  if (method === 'GET' && (path.includes('action-plans') || path === '/api/action-operational/plans')) {
    const doc = await loadPlansDoc(env);
    return { status: 200, body: doc };
  }

  if (method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  }

  const identity = await resolveReviewerIdentity(input.authorization, env, {
    email: input.body?._dashboard_reviewer_email,
    name: input.body?._dashboard_reviewer_name,
  });
  if (!identity.ok) {
    return { status: 401, body: { ok: false, error: 'Não foi possível identificar o usuário.' } };
  }

  const body = input.body ?? {};
  const action = body.action ?? input.action;

  if (action === 'suggest_plan') {
    const result = await suggestActionPlanForCase(body.row ?? body, env);
    appendPortalAuditEvent({
      action_type: result.used_fallback ? 'ai_suggestion_fallback' : 'ai_suggestion',
      email: identity.email,
      name: identity.name,
      client_id: body.client_id ?? body.row?.client_id,
      client_name: body.client_name ?? body.row?.client_name,
      cycle_code: body.cycle_code ?? body.row?.cycle_code,
      origin: body.origin ?? 'plano-de-acao',
      summary: result.used_fallback
        ? 'Sugestão automática (fallback)'
        : 'Sugestão de plano gerada com Gemini',
    });
    return { status: 200, body: result };
  }

  if (action === 'priority_review' || path.includes('priority-review')) {
    if (!usePostgresPrimary(env)) {
      const entry = savePlansJsonLegacy(body, 'priority_review', identity);
      appendPortalAuditEvent({
        action_type: 'priority_updated',
        email: identity.email,
        name: identity.name,
        client_id: body.client_id,
        client_name: body.client_name,
        cycle_code: body.cycle_code,
        origin: body.origin ?? 'plano-de-acao',
        summary: `${body.previous_priority ?? body.previous_ai_priority ?? '—'} → ${body.human_priority}`,
        before: { priority: body.previous_priority ?? body.previous_ai_priority },
        after: { priority: body.human_priority },
      });
      return { status: 200, body: { ok: true, entry, storage: 'json' } };
    }
    try {
      const supabase = createBusinessDataAdminClient(env);
      const entry = await savePriorityReviewPostgres(supabase, body, identity);
      const doc = await fetchOperationalPlansDocument(supabase);
      writeActionPlansJsonSnapshot(doc);
      const auditPayload = {
        action_type: 'priority_updated',
        user_email: identity.email,
        user_name: identity.name,
        entity_type: 'action_case',
        client_id: body.client_id,
        client_name: body.client_name,
        cycle_code: body.cycle_code,
        page: body.origin ?? 'plano-de-acao',
        summary: `${body.previous_priority ?? body.previous_ai_priority ?? '—'} → ${body.human_priority}`,
        before: { priority: body.previous_priority ?? body.previous_ai_priority },
        after: { priority: body.human_priority },
        metadata: { response_id: body.response_id ?? null },
      };
      await insertSystemAuditEvent(supabase, auditPayload);
      appendPortalAuditEvent({ ...auditPayload, email: identity.email, name: identity.name, origin: auditPayload.page });
      return { status: 200, body: { ok: true, entry, storage: 'postgres' } };
    } catch (err) {
      return { status: 500, body: { ok: false, error: serializeError(err) } };
    }
  }

  if (action === 'save_plan' || path.includes('save-plan')) {
    if (!usePostgresPrimary(env)) {
      const entry = savePlansJsonLegacy(body, 'save_plan', identity);
      appendPortalAuditEvent({
        action_type: 'plan_save',
        email: identity.email,
        name: identity.name,
        client_id: body.client_id,
        client_name: body.client_name,
        cycle_code: body.cycle_code,
        origin: body.origin ?? 'plano-de-acao',
        summary: `Status: ${body.status ?? 'Novo'}`,
        after: { plan: entry.plan },
      });
      return { status: 200, body: { ok: true, entry, storage: 'json' } };
    }
    try {
      const supabase = createBusinessDataAdminClient(env);
      const actionCase = await upsertActionCase(supabase, {
        client_id: body.client_id,
        response_id: body.response_id,
        cycle_code: body.cycle_code,
        status: body.status,
      });
      const { plan, previous } = await upsertActionPlanRow(supabase, actionCase.id, body, identity);
      const changeType = previous ? 'action_plan_updated' : 'action_plan_created';
      if (body.ai_suggestion_snapshot) {
        await appendActionPlanHistory(
          supabase,
          actionCase.id,
          'ai_suggestion_accepted',
          { suggestion: body.ai_suggestion_snapshot, plan },
          identity.email,
        );
      }
      await appendActionPlanHistory(
        supabase,
        actionCase.id,
        changeType,
        { previous, plan },
        identity.email,
      );
      const doc = await fetchOperationalPlansDocument(supabase);
      const entry = doc.entries.find((e) => entryKey(e) === entryKey(body));
      writeActionPlansJsonSnapshot(doc);
      const planAction = previous ? 'action_plan_updated' : 'action_plan_created';
      const auditPayload = {
        action_type: planAction,
        user_email: identity.email,
        user_name: identity.name,
        entity_type: 'action_plan',
        entity_id: plan?.id ?? null,
        client_id: body.client_id,
        client_name: body.client_name,
        cycle_code: body.cycle_code,
        page: body.origin ?? 'plano-de-acao',
        summary: body.action_text ? String(body.action_text).slice(0, 120) : 'Plano de ação',
        before: previous ? { action_text: previous.action_text, status: previous.status } : null,
        after: { action_text: plan?.action_text, status: plan?.status },
        metadata: { response_id: body.response_id ?? null },
      };
      await insertSystemAuditEvent(supabase, auditPayload);
      appendPortalAuditEvent({ ...auditPayload, email: identity.email, name: identity.name, origin: auditPayload.page });
      return { status: 200, body: { ok: true, entry, storage: 'postgres' } };
    } catch (err) {
      return { status: 500, body: { ok: false, error: serializeError(err) } };
    }
  }

  return { status: 400, body: { ok: false, error: 'Ação desconhecida' } };
}

export async function handleActionOperationalVercel(req, res) {
  let body = req.body;
  if (body == null && typeof req.on === 'function') {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          resolve({});
        }
      });
    });
  }
  const url = req.url ?? '';
  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  const out = await executeActionOperationalHttpRequest({
    method: req.method,
    path: url.split('?')[0],
    authorization: auth,
    body,
    env: process.env,
  });
  if (typeof res.status === 'function') {
    res.status(out.status).json(out.body);
    return;
  }
  res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(out.body));
}

export { loadPlansDoc, usePostgresPrimary };
