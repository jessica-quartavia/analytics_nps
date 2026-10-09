import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LOG_PATH = join(ROOT, 'data/operational/portal_audit_log.json');

const ACTION_LABELS = {
  priority_review: 'Prioridade corrigida',
  priority_updated: 'Prioridade corrigida',
  voc_reviewed: 'VoC revisado',
  plan_created: 'Plano criado',
  plan_updated: 'Plano editado',
  plan_update: 'Plano editado',
  plan_save: 'Plano salvo',
  action_plan_created: 'Plano criado',
  action_plan_updated: 'Plano atualizado',
  ai_suggestion_fallback: 'Sugestão automática (fallback)',
  voc_review: 'Correção de VoC',
  ai_suggestion: 'Sugestão IA (plano)',
  pdf_export: 'Exportação PDF',
  ai_suggestion_accepted: 'Sugestão IA aceita',
  priority_changed: 'Prioridade alterada',
};

function ensureFile() {
  if (!existsSync(LOG_PATH)) {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    writeFileSync(LOG_PATH, JSON.stringify({ updated_at: null, events: [] }, null, 2), 'utf8');
  }
}

function readDoc() {
  ensureFile();
  try {
    return JSON.parse(readFileSync(LOG_PATH, 'utf8'));
  } catch {
    return { updated_at: null, events: [] };
  }
}

export function appendPortalAuditEvent(event) {
  const doc = readDoc();
  doc.events = doc.events ?? [];
  const row = {
    id: randomUUID(),
    at: new Date().toISOString(),
    action_type: event.action_type,
    email: event.email ?? null,
    name: event.name ?? null,
    client_id: event.client_id ?? null,
    client_name: event.client_name ?? null,
    cycle_code: event.cycle_code ?? null,
    origin: event.origin ?? 'plano-de-acao',
    summary: event.summary ?? ACTION_LABELS[event.action_type] ?? event.action_type,
    before: event.before ?? null,
    after: event.after ?? null,
    payload: event.payload ?? null,
  };
  doc.events.unshift(row);
  doc.events = doc.events.slice(0, 5000);
  doc.updated_at = row.at;
  writeFileSync(LOG_PATH, JSON.stringify(doc, null, 2), 'utf8');
  return row;
}

function historyToLog(entry) {
  const rows = [];
  const base = {
    client_id: entry.client_id,
    client_name: entry.client_name,
    cycle_code: entry.cycle_code,
    origin: 'plano-de-acao',
  };
  if (entry.priority_review?.reviewed_at) {
    rows.push({
      ...base,
      id: `pr-${entry.client_id}-${entry.priority_review.reviewed_at}`,
      at: entry.priority_review.reviewed_at,
      email: entry.priority_review.reviewed_by,
      name: entry.priority_review.reviewed_by_name,
      action_type: 'priority_review',
      summary: `${entry.priority_review.previous_ai_priority ?? '—'} → ${entry.human_priority ?? '—'}`,
      before: { priority: entry.priority_review.previous_ai_priority },
      after: { priority: entry.human_priority },
      payload: entry.priority_review,
    });
  }
  if (entry.plan?.updated_at) {
    rows.push({
      ...base,
      id: `plan-${entry.client_id}-${entry.plan.updated_at}`,
      at: entry.plan.updated_at,
      email: entry.plan.updated_by,
      action_type: 'plan_save',
      summary: `Status: ${entry.plan.status ?? '—'}`,
      after: { plan: entry.plan },
    });
  }
  for (const h of entry.history ?? []) {
    rows.push({
      ...base,
      id: `hist-${entry.client_id}-${h.at ?? h.changed_at}-${h.type}`,
      at: h.at ?? h.changed_at,
      email: h.by ?? h.changed_by,
      action_type: h.type ?? h.change_type ?? 'plan_update',
      summary: ACTION_LABELS[h.type ?? h.change_type] ?? h.type,
      payload: h.snapshot ?? h,
      before: h.snapshot?.previous ?? null,
      after: h.snapshot?.plan ?? h.snapshot ?? null,
    });
  }
  return rows;
}

export function listPortalAuditEvents({ actionPlansDoc = null } = {}) {
  const doc = readDoc();
  const fromFile = doc.events ?? [];
  const fromPlans = [];
  for (const e of actionPlansDoc?.entries ?? []) {
    fromPlans.push(...historyToLog(e));
  }
  const merged = [...fromFile, ...fromPlans];
  const seen = new Set();
  const out = [];
  for (const ev of merged.sort((a, b) => String(b.at).localeCompare(String(a.at)))) {
    const key = ev.id ?? `${ev.at}-${ev.email}-${ev.action_type}-${ev.client_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...ev,
      action_label: ACTION_LABELS[ev.action_type] ?? ev.action_type,
    });
  }
  return out.slice(0, 2000);
}

export { LOG_PATH, ACTION_LABELS };
