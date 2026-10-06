import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadVocDbMode, safePostgresLogInfo, assertPostgresBusinessData } from '../lib/persistence/voc-db-config.mjs';
import { createPostgresVocStore } from '../lib/persistence/voc-postgres-store.mjs';

describe('voc-postgres-store', () => {
  it('default ANALYTICS_NPS_DB_MODE is postgres', () => {
    assert.equal(loadVocDbMode({}), 'postgres');
    assert.equal(loadVocDbMode({ ANALYTICS_NPS_DB_MODE: 'postgrest' }), 'postgrest');
  });

  it('safePostgresLogInfo omits password', () => {
    const info = safePostgresLogInfo('postgresql://user:secret@db.rckpuebaiswrxzmywllv.supabase.co:6543/postgres');
    assert.equal(info.host, 'db.rckpuebaiswrxzmywllv.supabase.co');
    assert.equal(info.database, 'postgres');
    assert.ok(!JSON.stringify(info).includes('secret'));
  });

  it('rejects BASE QV postgres URL', () => {
    assert.throws(() =>
      assertPostgresBusinessData({
        configured: true,
        databaseUrl: 'postgresql://x@db.lacinxsvjdwalkchxyeo.supabase.co/postgres',
      }),
    );
  });

  it('validateConnection + upsert idempotency (mock sql)', async () => {
    const calls = [];
    const mockSql = Object.assign(
      async (strings, ...values) => {
        calls.push({ q: strings.join('?'), values });
        const q = strings.join(' ').toLowerCase();
        if (q.includes('voc_classifier_versions') && q.includes('is_active')) {
          return [{ classifier_version: 'gemini_v1', provider: 'gemini', model: 'gemini-3.6-flash', is_active: true }];
        }
        if (q.includes('insert into analytics_nps.voc_responses')) {
          return [{ id: '11111111-1111-1111-1111-111111111111', answer_hash: values[8] }];
        }
        if (q.includes('insert into analytics_nps.voc_classifications')) {
          return [{ id: '22222222-2222-2222-2222-222222222222', needs_human_review: false, valence: 'Positiva', confidence: 0.9 }];
        }
        if (q.includes('voc_ai_cache') && q.includes('select')) return [];
        if (q.includes('voc_review_queue')) return [];
        if (q.includes('voc_classification_runs') && q.includes('insert')) {
          return [{ id: '33333333-3333-3333-3333-333333333333' }];
        }
        if (q.includes('update analytics_nps.voc_classification_runs')) return [];
        if (q.includes('delete from analytics_nps.voc_classification_runs')) return [];
        return [];
      },
      { json: (v) => v, end: async () => {} },
    );

    const env = {
      ANALYTICS_NPS_DATABASE_URL: 'postgresql://u:p@aws.rckpuebaiswrxzmywllv.supabase.co:6543/postgres',
    };
    const store = createPostgresVocStore(env, { sql: mockSql });

    const v = await store.validateConnection();
    assert.equal(v.hasActiveClassifier, true);

    const row = await store.upsertVocResponse({
      source_response_id: 'r1',
      client_id: null,
      analytical_cycle_code: 'C',
      score: 10,
      nps_category: 'Promotor',
      question_key: 'q1',
      question_text: 'Q',
      answer_text: 'A',
      answer_hash: 'hash1',
      submitted_at: null,
      source_updated_at: null,
    });
    assert.ok(row.id);

    const runId = await store.startClassificationRun({
      triggerType: 'manual',
      provider: 'test',
      requestedModel: 'm',
      promptVersion: 'p',
      classifierVersion: 'gemini_v1',
    });
    await store.finishClassificationRun(runId, { status: 'success', errors: [] });
    await store.deleteRun(runId);

    const dup = await store.upsertClassification({
      voc_response_id: row.id,
      source_response_id: 'r1',
      topic: 'Resultados',
      valence: 'Neutra',
      confidence: 0.8,
      evidence: 'e',
      valence_reason: 'r',
      classifier_source: 'gemini',
      ai_provider: 'gemini',
      ai_model: 'm',
      prompt_version: 'p',
      classifier_version: 'gemini_v1',
      input_hash: 'ih1',
      needs_human_review: false,
      fallback_reason: null,
    });
    assert.equal(dup.valence, 'Positiva');

    assert.ok(calls.some((c) => c.q.includes('voc_responses')));
    await store.close();
  });
});
