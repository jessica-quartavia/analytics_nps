import { analyticsFrom, createBusinessDataAdminClient } from './voc-supabase-store.mjs';
import { listPortalAuditEvents } from './portal-audit-log.mjs';

const ACTION_LABELS = {
  priority_updated: 'Prioridade corrigida',
  priority_review: 'Prioridade corrigida',
  priority_changed: 'Prioridade corrigida',
  voc_reviewed: 'VoC revisado',
  voc_review: 'Correção de VoC',
  action_plan_created: 'Plano criado',
  action_plan_updated: 'Plano atualizado',
  plan_created: 'Plano criado',
  plan_updated: 'Plano editado',
  plan_save: 'Plano salvo',
  pdf_exported: 'Exportação PDF',
  pdf_export: 'Exportação PDF',
  ai_classification: 'Classificação automática',
};

function normalizeEvent(raw) {
  const at = raw.occurred_at ?? raw.at ?? null;
  const action_type = raw.action_type ?? 'unknown';
  return {
    id: raw.id ?? `${at}-${action_type}-${raw.client_id ?? ''}`,
    occurred_at: at,
    at,
    user_email: raw.user_email ?? raw.email ?? null,
    user_name: raw.user_name ?? raw.name ?? null,
    email: raw.user_email ?? raw.email ?? null,
    name: raw.user_name ?? raw.name ?? null,
    action_type,
    action_label: raw.action_label ?? ACTION_LABELS[action_type] ?? action_type,
    entity_type: raw.entity_type ?? null,
    client_id: raw.client_id ?? null,
    client_name: raw.client_name ?? null,
    cycle_code: raw.cycle_code ?? null,
    page: raw.page ?? raw.origin ?? null,
    origin: raw.origin ?? raw.page ?? null,
    summary: raw.summary ?? ACTION_LABELS[action_type] ?? action_type,
    before: raw.before ?? null,
    after: raw.after ?? null,
    payload: raw.payload ?? null,
  };
}

function mergeDedupe(events) {
  const seen = new Set();
  const out = [];
  for (const ev of events.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))) {
    const key = ev.id ?? `${ev.at}-${ev.email}-${ev.action_type}-${ev.client_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  return out.slice(0, 2000);
}

async function fetchPostgresEvents(env) {
  const supabase = createBusinessDataAdminClient(env);
  if (!supabase) return [];

  const events = [];

  const { data: centralLogs, error: centralErr } = await analyticsFrom(supabase, 'system_audit_log')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(1000);
  if (!centralErr && (centralLogs?.length ?? 0) > 0) {
    for (const r of centralLogs) {
      events.push(normalizeEvent({ ...r, id: `sal-${r.id}` }));
    }
    return events;
  }

  const clientNameById = new Map();

  const { data: cases } = await analyticsFrom(supabase, 'action_cases').select('id, client_id, cycle_code');
  for (const c of cases ?? []) {
    if (c.client_id) clientNameById.set(c.client_id, c.client_id);
  }

  const { data: priorityReviews, error: prErr } = await analyticsFrom(supabase, 'action_priority_reviews')
    .select('*')
    .order('reviewed_at', { ascending: false })
    .limit(800);
  if (prErr) throw prErr;

  for (const r of priorityReviews ?? []) {
    const beforeP = r.previous_ai_priority ?? '—';
    const afterP = r.human_priority ?? '—';
    events.push(
      normalizeEvent({
        id: `pg-pr-${r.id}`,
        occurred_at: r.reviewed_at,
        user_email: r.reviewed_by,
        action_type: 'priority_updated',
        entity_type: 'action_case',
        client_id: r.client_id,
        client_name: clientNameById.get(r.client_id) ?? null,
        cycle_code: null,
        page: 'plano-de-acao',
        origin: 'plano-de-acao',
        summary: `${beforeP} → ${afterP}`,
        before: { priority: beforeP },
        after: { priority: afterP },
        payload: r,
      }),
    );
  }

  const { data: vocReviews, error: vocErr } = await analyticsFrom(supabase, 'voc_manual_reviews')
    .select('*')
    .order('reviewed_at', { ascending: false })
    .limit(800);
  if (vocErr) throw vocErr;

  for (const r of vocReviews ?? []) {
    const topics = Array.isArray(r.reviewed_topics) ? r.reviewed_topics : [];
    const summaryTopics = topics.map((t) => `${t.topic}: ${t.valence}`).join('; ');
    events.push(
      normalizeEvent({
        id: `pg-voc-${r.id}`,
        occurred_at: r.reviewed_at,
        user_email: r.reviewer_email,
        user_name: r.reviewer_name,
        action_type: 'voc_reviewed',
        entity_type: 'voc_response',
        client_id: r.client_id,
        cycle_code: r.analytical_cycle_code,
        page: 'plano-de-acao',
        origin: 'voc-manual-review',
        summary: summaryTopics || r.review_notes || 'Revisão de temas VoC',
        before: r.previous_topics_snapshot ?? null,
        after: { topics: r.reviewed_topics, notes: r.review_notes },
        payload: r,
      }),
    );
  }

  const caseById = new Map((cases ?? []).map((c) => [c.id, c]));

  const { data: history, error: histErr } = await analyticsFrom(supabase, 'action_plan_history')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(800);
  if (histErr) throw histErr;

  for (const h of history ?? []) {
    const linked = caseById.get(h.action_case_id);
    const clientId = linked?.client_id ?? h.snapshot?.client_id ?? null;
    const cycle = linked?.cycle_code ?? h.snapshot?.cycle_code ?? null;
    let action_type = h.change_type;
    if (action_type === 'plan_created' || action_type === 'action_plan_created') {
      action_type = 'action_plan_created';
    } else if (action_type === 'plan_updated' || action_type === 'action_plan_updated' || action_type === 'plan_update') {
      action_type = 'action_plan_updated';
    } else if (action_type === 'priority_changed') {
      action_type = 'priority_updated';
    } else if (action_type === 'ai_classification') {
      continue;
    }

    if (!['action_plan_created', 'action_plan_updated', 'priority_updated'].includes(action_type)) {
      continue;
    }

    const snap = h.snapshot ?? {};
    let summary = ACTION_LABELS[action_type];
    let before = null;
    let after = null;
    if (action_type === 'priority_updated') {
      before = { priority: snap.priority_review?.previous_ai_priority ?? snap.previous_priority };
      after = { priority: snap.human_priority };
      summary = `${before.priority ?? '—'} → ${after.priority ?? '—'}`;
    } else if (action_type.startsWith('action_plan')) {
      after = { action_text: snap.plan?.action_text ?? snap.action_text };
      summary = snap.plan?.action_text ? String(snap.plan.action_text).slice(0, 80) : summary;
    }

    events.push(
      normalizeEvent({
        id: `pg-hist-${h.id}`,
        occurred_at: h.changed_at,
        user_email: h.changed_by,
        action_type,
        entity_type: 'action_case',
        client_id: clientId,
        cycle_code: cycle,
        page: 'plano-de-acao',
        origin: 'plano-de-acao',
        summary,
        before,
        after,
        payload: h,
      }),
    );
  }

  const { data: plans, error: planErr } = await analyticsFrom(supabase, 'action_plans')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(400);
  if (planErr) throw planErr;

  for (const p of plans ?? []) {
    events.push(
      normalizeEvent({
        id: `pg-plan-${p.id}-${p.updated_at}`,
        occurred_at: p.updated_at,
        user_email: p.updated_by ?? p.created_by,
        action_type: p.created_at === p.updated_at ? 'action_plan_created' : 'action_plan_updated',
        entity_type: 'action_plan',
        client_id: p.client_id,
        cycle_code: p.cycle_code,
        page: 'plano-de-acao',
        origin: 'plano-de-acao',
        summary: p.action_text ? String(p.action_text).slice(0, 100) : 'Plano de ação',
        after: { action_text: p.action_text, status: p.status },
        payload: p,
      }),
    );
  }

  return events;
}

/**
 * Agrega logs operacionais (Postgres + arquivo + overlays de planos).
 * @returns {Promise<{ events: object[], warnings: string[], sources: string[] }>}
 */
export async function aggregateSystemLogs(env = process.env) {
  const warnings = [];
  const sources = [];
  let events = [];

  try {
    const pgEvents = await fetchPostgresEvents(env);
    if (pgEvents.length) {
      events.push(...pgEvents);
      sources.push('postgres');
    }
  } catch (err) {
    warnings.push(`Postgres: ${err.message ?? String(err)}`);
  }

  try {
    let actionPlansDoc = null;
    try {
      const { loadPlansDoc } = await import('./action-operational-http.mjs');
      actionPlansDoc = await loadPlansDoc(env);
    } catch {
      actionPlansDoc = { entries: [] };
    }
    events.push(...listPortalAuditEvents({ actionPlansDoc }));
    sources.push('portal_audit');
  } catch (err) {
    warnings.push(`Portal audit: ${err.message ?? String(err)}`);
  }

  return {
    events: mergeDedupe(events.map(normalizeEvent)),
    warnings,
    sources,
  };
}

export { ACTION_LABELS as SYSTEM_LOG_ACTION_LABELS };
