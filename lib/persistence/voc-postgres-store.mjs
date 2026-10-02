import postgres from 'postgres';
import { loadPostgresDatabaseConfig, assertPostgresBusinessData, safePostgresLogInfo } from './voc-db-config.mjs';

function pgError(context, err) {
  const e = new Error(`${context}: ${err?.message ?? String(err)}`);
  e.name = 'PostgresAnalyticsError';
  e.code = err?.code;
  e.detail = err?.detail;
  e.hint = err?.hint;
  throw e;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ sql?: import('postgres').Sql }} [deps]
 */
export function createPostgresVocStore(env = process.env, deps = {}) {
  const config = loadPostgresDatabaseConfig(env);
  assertPostgresBusinessData(config);

  const sql =
    deps.sql ??
    postgres(config.databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 30,
      ssl: config.databaseUrl.includes('sslmode=disable') ? false : 'require',
    });

  const store = {
    mode: 'postgres',
    logInfo() {
      return { mode: 'postgres', connected: true, ...safePostgresLogInfo(config.databaseUrl) };
    },

    async close() {
      if (!deps.sql) await sql.end({ timeout: 5 });
    },

    async validateConnection() {
      const rows = await sql`
        select classifier_version, provider, model, prompt_version, is_active
        from analytics_nps.voc_classifier_versions
        where is_active = true
        order by created_at desc
        limit 1
      `.catch((err) => pgError('validateConnection', err));
      return { ok: true, sampleRows: rows.length, hasActiveClassifier: rows.length > 0, row: rows[0] ?? null };
    },

    async getActiveClassifierVersion() {
      const rows = await sql`
        select *
        from analytics_nps.voc_classifier_versions
        where is_active = true
        order by created_at desc
        limit 1
      `.catch((err) => pgError('getActiveClassifierVersion', err));
      return rows[0] ?? null;
    },

    async getExistingResponse(sourceResponseId, questionKey) {
      const rows = await sql`
        select id, answer_hash, source_updated_at
        from analytics_nps.voc_responses
        where source_response_id = ${sourceResponseId}
          and question_key = ${questionKey}
        limit 1
      `.catch((err) => pgError('getExistingResponse', err));
      return rows[0] ?? null;
    },

    async getVocSourceWatermark() {
      const rows = await sql`
        select max(
          greatest(
            coalesce(submitted_at, '1970-01-01'::timestamptz),
            coalesce(source_updated_at, submitted_at, '1970-01-01'::timestamptz)
          )
        ) as watermark
        from analytics_nps.voc_responses
      `.catch((err) => pgError('getVocSourceWatermark', err));
      const w = rows[0]?.watermark;
      return w ? new Date(w).toISOString() : null;
    },

    async hasClassificationForVersion(sourceResponseId, classifierVersion) {
      const rows = await sql`
        select id
        from analytics_nps.voc_classifications
        where source_response_id = ${sourceResponseId}
          and classifier_version = ${classifierVersion}
        limit 1
      `.catch((err) => pgError('hasClassificationForVersion', err));
      return Boolean(rows[0]);
    },

    async upsertVocResponse(row) {
      const rows = await sql`
        insert into analytics_nps.voc_responses (
          source_response_id, client_id, analytical_cycle_code, score, nps_category,
          question_key, question_text, answer_text, answer_hash, submitted_at, source_updated_at
        ) values (
          ${row.source_response_id},
          ${row.client_id},
          ${row.analytical_cycle_code},
          ${row.score},
          ${row.nps_category},
          ${row.question_key},
          ${row.question_text},
          ${row.answer_text},
          ${row.answer_hash},
          ${row.submitted_at},
          ${row.source_updated_at}
        )
        on conflict (source_response_id, question_key) do update set
          client_id = excluded.client_id,
          analytical_cycle_code = excluded.analytical_cycle_code,
          score = excluded.score,
          nps_category = excluded.nps_category,
          question_text = excluded.question_text,
          answer_text = excluded.answer_text,
          answer_hash = excluded.answer_hash,
          submitted_at = excluded.submitted_at,
          source_updated_at = excluded.source_updated_at,
          updated_at = now()
        returning id, answer_hash
      `.catch((err) => pgError('upsertVocResponse', err));
      return rows[0];
    },

    async getClassificationByHash(inputHash, topic, classifierVersion) {
      const rows = await sql`
        select id, needs_human_review, valence, confidence
        from analytics_nps.voc_classifications
        where input_hash = ${inputHash}
          and topic = ${topic}
          and classifier_version = ${classifierVersion}
        limit 1
      `.catch((err) => pgError('getClassificationByHash', err));
      return rows[0] ?? null;
    },

    async getAiCache(inputHash) {
      const rows = await sql`
        select result
        from analytics_nps.voc_ai_cache
        where input_hash = ${inputHash}
        limit 1
      `.catch((err) => pgError('getAiCache', err));
      return rows[0]?.result ?? null;
    },

    async touchAiCache(inputHash) {
      await sql`
        update analytics_nps.voc_ai_cache
        set last_used_at = now()
        where input_hash = ${inputHash}
      `.catch((err) => pgError('touchAiCache', err));
    },

    async upsertAiCache(row) {
      await sql`
        insert into analytics_nps.voc_ai_cache (
          input_hash, question_text, answer_text, candidate_themes,
          provider, model, prompt_version, classifier_version, result
        ) values (
          ${row.input_hash},
          ${row.question_text},
          ${row.answer_text},
          ${sql.json(row.candidate_themes)},
          ${row.provider},
          ${row.model},
          ${row.prompt_version},
          ${row.classifier_version},
          ${sql.json(row.result)}
        )
        on conflict (input_hash) do update set
          question_text = excluded.question_text,
          answer_text = excluded.answer_text,
          candidate_themes = excluded.candidate_themes,
          provider = excluded.provider,
          model = excluded.model,
          prompt_version = excluded.prompt_version,
          classifier_version = excluded.classifier_version,
          result = excluded.result,
          last_used_at = now()
      `.catch((err) => pgError('upsertAiCache', err));
    },

    async upsertClassification(row) {
      const rows = await sql`
        insert into analytics_nps.voc_classifications (
          voc_response_id, source_response_id, topic, valence, confidence,
          evidence, valence_reason, classifier_source, ai_provider, ai_model,
          prompt_version, classifier_version, input_hash, needs_human_review, fallback_reason
        ) values (
          ${row.voc_response_id},
          ${row.source_response_id},
          ${row.topic},
          ${row.valence},
          ${row.confidence},
          ${row.evidence},
          ${row.valence_reason},
          ${row.classifier_source},
          ${row.ai_provider},
          ${row.ai_model},
          ${row.prompt_version},
          ${row.classifier_version},
          ${row.input_hash},
          ${row.needs_human_review},
          ${row.fallback_reason}
        )
        on conflict (input_hash, topic, classifier_version) do update set
          voc_response_id = excluded.voc_response_id,
          source_response_id = excluded.source_response_id,
          valence = excluded.valence,
          confidence = excluded.confidence,
          evidence = excluded.evidence,
          valence_reason = excluded.valence_reason,
          classifier_source = excluded.classifier_source,
          ai_provider = excluded.ai_provider,
          ai_model = excluded.ai_model,
          prompt_version = excluded.prompt_version,
          needs_human_review = excluded.needs_human_review,
          fallback_reason = excluded.fallback_reason,
          classified_at = now()
        returning id, needs_human_review, valence, confidence
      `.catch((err) => pgError('upsertClassification', err));
      return rows[0];
    },

    async enqueueReviewIfNeeded({ classificationId, sourceResponseId, reason }) {
      if (!reason) return;
      const pending = await sql`
        select id
        from analytics_nps.voc_review_queue
        where classification_id = ${classificationId}
          and status = 'pending'
        limit 1
      `.catch((err) => pgError('enqueueReviewIfNeeded select', err));
      if (pending[0]) return;
      await sql`
        insert into analytics_nps.voc_review_queue (
          classification_id, source_response_id, reason, status
        ) values (
          ${classificationId},
          ${sourceResponseId},
          ${reason},
          'pending'
        )
      `.catch((err) => {
        if (/duplicate|unique/i.test(err?.message ?? '')) return;
        pgError('enqueueReviewIfNeeded insert', err);
      });
    },

    async startClassificationRun({ triggerType, provider, requestedModel, promptVersion, classifierVersion }) {
      const rows = await sql`
        insert into analytics_nps.voc_classification_runs (
          status, trigger_type, provider, requested_model, effective_model,
          prompt_version, classifier_version
        ) values (
          'running',
          ${triggerType},
          ${provider},
          ${requestedModel},
          ${requestedModel},
          ${promptVersion},
          ${classifierVersion}
        )
        returning id
      `.catch((err) => pgError('startClassificationRun', err));
      return rows[0].id;
    },

    async finishClassificationRun(runId, patch) {
      if (!runId) return;
      await sql`
        update analytics_nps.voc_classification_runs
        set
          finished_at = now(),
          status = ${patch.status},
          responses_found = ${patch.responses_found ?? 0},
          responses_processed = ${patch.responses_processed ?? 0},
          gemini_success = ${patch.gemini_success ?? 0},
          rules_fallback = ${patch.rules_fallback ?? 0},
          low_confidence = ${patch.low_confidence ?? 0},
          http_429 = ${patch.http_429 ?? 0},
          http_503 = ${patch.http_503 ?? 0},
          timeouts = ${patch.timeouts ?? 0},
          invalid_outputs = ${patch.invalid_outputs ?? 0},
          errors = ${sql.json(patch.errors ?? [])}
        where id = ${runId}
      `.catch((err) => pgError('finishClassificationRun', err));
    },

    async deleteRun(runId) {
      await sql`
        delete from analytics_nps.voc_classification_runs
        where id = ${runId}
      `.catch((err) => pgError('deleteRun', err));
    },
  };

  return store;
}
