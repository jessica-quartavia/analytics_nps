import { getAuthSessionUser, getAccessToken } from '../auth/dashboard-auth.mjs';
import { patchLocalActionPlanEntry } from '../data/analytics-store.js';
import { showVocSaveToast } from './voc-review-modal.mjs';

export async function postActionOperational(body) {
  const user = getAuthSessionUser();
  const token = await getAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api/action-operational/plans', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...body,
      _dashboard_reviewer_email: user?.email,
      _dashboard_reviewer_name: user?.name,
    }),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, error: 'Resposta inválida do servidor.' };
  }
  return { res, json };
}

function humanizeApiError(json) {
  if (typeof json.error === 'string') return json.error;
  if (json.error?.message) return json.error.message;
  return 'Falha na operação.';
}

export async function saveActionPlan(
  row,
  { action_text, plan_source },
  { pendingAiSuggestion, onSaved, origin = 'plano-de-acao' } = {},
) {
  let planOrigin = plan_source ?? 'manual';
  if (pendingAiSuggestion) {
    const same =
      String(action_text ?? '').trim() === String(pendingAiSuggestion.action_text ?? '').trim();
    if (same) planOrigin = pendingAiSuggestion.plan_source ?? plan_source ?? 'manual';
    else planOrigin = 'ai_revised';
  }

  const { res, json } = await postActionOperational({
    action: 'save_plan',
    client_id: row.client_id,
    response_id: row.response_id,
    cycle_code: row.cycle_code,
    client_name: row.client_name,
    action_text,
    action_proposal: action_text,
    plan_source: planOrigin,
    plan_origin: planOrigin,
    ai_suggestion_snapshot: pendingAiSuggestion,
    origin,
  });
  if (!res.ok || !json.ok) throw new Error(humanizeApiError(json));
  patchLocalActionPlanEntry(json.entry);
  showVocSaveToast('Plano de ação salvo.');
  onSaved?.(json.entry);
  return json.entry;
}

export async function suggestActionPlanWithAi(row) {
  const { res, json } = await postActionOperational({
    action: 'suggest_plan',
    row,
    client_id: row.client_id,
    client_name: row.client_name,
    cycle_code: row.cycle_code,
    origin: 'plano-de-acao',
  });
  if (!res.ok || json.ok === false) {
    return {
      ok: false,
      message: humanizeApiError(json),
    };
  }
  return {
    ok: true,
    suggestion: json.suggestion,
    notice: json.notice ?? null,
    used_fallback: Boolean(json.used_fallback),
    plan_source: json.plan_source ?? json.suggestion?.plan_source ?? 'fallback',
  };
}

export async function logPortalAuditEvent(payload) {
  try {
    const token = await getAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch('/api/portal-audit/logs', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    /* não bloqueia UX */
  }
}
