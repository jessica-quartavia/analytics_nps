import { verifyVocClassifierBearer } from './voc-api-auth.mjs';
import { classifyActionUnit } from '../analytics/action-unit-classifier.mjs';
import { loadActionAiConfig } from '../analytics/action-ai-config.mjs';
import { upsertActionClassification } from './action-postgres-store.mjs';
import { createBusinessDataAdminClient } from './voc-supabase-store.mjs';
import { serializeError } from './voc-supabase-errors.mjs';

function sanitizeHttpError(err) {
  const parsed = serializeError(err);
  try {
    return JSON.parse(parsed);
  } catch {
    return { message: parsed };
  }
}

export function buildActionClassifyHealthPayload(env = process.env) {
  const ai = loadActionAiConfig(env);
  return {
    ok: true,
    service: 'analytics-nps-action-classifier',
    provider: ai.provider ?? 'gemini',
    model: ai.model || 'gemini-3.6-flash',
    prompt_version: ai.promptVersion,
    classifier_version: ai.classifierVersion,
    gemini_enabled: Boolean(ai.geminiActivated),
    has_gemini_key: ai.hasApiKey,
  };
}

export async function executeActionClassifyHttpRequest(input) {
  if (input.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  }

  const auth = verifyVocClassifierBearer(input.authorization, input.env);
  if (!auth.ok) {
    return { status: 401, body: { ok: false, error: 'Unauthorized', code: auth.code } };
  }

  const body = input.body ?? {};
  const sourceId = body.source_id ?? body.response_id;
  if (!sourceId) {
    return {
      status: 400,
      body: { ok: false, code: 'INVALID_INPUT', error: 'source_id é obrigatório' },
    };
  }

  try {
    const result = await classifyActionUnit(
      {
        source_id: sourceId,
        response_id: sourceId,
        client_name: body.client_name,
        cycle_code: body.cycle_code,
        previous_score: body.previous_score,
        current_score: body.current_score,
        score_delta: body.score_delta,
        nps_migration: body.nps_migration,
        priority: body.priority ?? body.rules_priority,
        reason: body.reason,
        comment: body.comment,
        topics: body.topics,
        primary_topic: body.primary_topic,
        critical_flag: body.critical_flag,
      },
      input.env,
    );

    if (!result.ok) {
      return { status: 400, body: result };
    }

    let persisted = null;
    const supabase = createBusinessDataAdminClient(input.env);
    if (supabase && body.persist !== false) {
      persisted = await upsertActionClassification(supabase, {
        source_id: sourceId,
        ...result.classification,
        classifier_source: result.classifier_source,
        ai_provider: result.provider,
        ai_model: result.model,
        prompt_version: result.prompt_version,
        model: result.model,
        input_hash: result.input_hash,
        needs_human_review: result.needs_human_review ?? false,
        fallback_reason: result.fallback_reason ?? null,
      });
    }

    return {
      status: 200,
      body: {
        ok: true,
        source_id: sourceId,
        ...result,
        persisted,
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, code: 'CLASSIFY_FAILED', error: sanitizeHttpError(err) },
    };
  }
}

export async function handleActionClassifyVercel(req, res) {
  let body = req.body;
  if (body == null && typeof req.on === 'function') {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    }).catch(() => ({}));
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  const out = await executeActionClassifyHttpRequest({
    method: req.method,
    authorization: auth,
    body,
    env: process.env,
  });

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(out.status).json(out.body);
    return;
  }
  res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(out.body));
}
