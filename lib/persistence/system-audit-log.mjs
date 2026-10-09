import { analyticsFrom } from './voc-supabase-store.mjs';
import { throwSupabaseError } from './voc-supabase-errors.mjs';

/**
 * Grava evento no Business Data (transação junto com persistência operacional).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function insertSystemAuditEvent(supabase, event) {
  if (!supabase || !event?.action_type) return null;
  const occurred_at = event.occurred_at ?? new Date().toISOString();
  const payload = {
    occurred_at,
    user_email: event.user_email ?? event.email ?? 'system@unknown',
    user_name: event.user_name ?? event.name ?? null,
    action_type: event.action_type,
    entity_type: event.entity_type ?? null,
    entity_id: event.entity_id ?? null,
    client_id: event.client_id ?? null,
    client_name: event.client_name ?? null,
    cycle_code: event.cycle_code ?? null,
    page: event.page ?? event.origin ?? null,
    summary: event.summary ?? event.action_type,
    before: event.before ?? null,
    after: event.after ?? null,
    metadata: event.metadata ?? {},
  };
  const { data, error } = await analyticsFrom(supabase, 'system_audit_log')
    .insert(payload)
    .select('id, occurred_at')
    .single();
  if (error) {
    console.error('[system_audit_log] insert failed:', error.message);
    return null;
  }
  return data;
}
