import { verifyVocClassifierBearer } from './voc-api-auth.mjs';
import { classifyVocUnit } from '../analytics/voc-unit-classifier.mjs';
import { loadVocAiConfig } from '../analytics/voc-ai-config.mjs';
import { serializeError } from './voc-supabase-errors.mjs';

function sanitizeHttpError(err) {
  const parsed = serializeError(err);
  try {
    return JSON.parse(parsed);
  } catch {
    return { message: parsed };
  }
}

export function buildVocClassifyHealthPayload(env = process.env) {
  const ai = loadVocAiConfig(env);
  return {
    ok: true,
    service: 'analytics-nps-voc-classifier',
    provider: ai.provider ?? 'gemini',
    model: ai.model || 'gemini-3.6-flash',
    prompt_version: ai.promptVersion,
    classifier_version: ai.classifierVersion,
    gemini_enabled: Boolean(ai.geminiActivated),
    has_gemini_key: ai.hasApiKey,
  };
}

/**
 * @param {object} input
 * @param {string} input.method
 * @param {string|undefined} input.authorization
 * @param {object|undefined} input.body
 */
export async function executeVocClassifyHttpRequest(input) {
  if (input.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  }

  const auth = verifyVocClassifierBearer(input.authorization);
  if (!auth.ok) {
    return { status: 401, body: { ok: false, error: 'Unauthorized', code: auth.code } };
  }

  const body = input.body ?? {};
  if (!body.answer || !Array.isArray(body.candidate_themes) || !body.candidate_themes.length) {
    return {
      status: 400,
      body: { ok: false, code: 'INVALID_INPUT', error: 'answer e candidate_themes são obrigatórios' },
    };
  }

  try {
    const result = await classifyVocUnit(
      {
        response_id: body.response_id ?? body.source_response_id,
        score: body.score ?? null,
        nps_category: body.nps_category ?? null,
        question: body.question ?? '',
        answer: body.answer,
        candidate_themes: body.candidate_themes,
        force: body.force === true || body.force === 'true',
      },
      input.env,
    );

    if (!result.ok) {
      return { status: 400, body: result };
    }

    return { status: 200, body: result };
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, code: 'CLASSIFY_FAILED', error: sanitizeHttpError(err) },
    };
  }
}

export async function executeVocPrepareHttpRequest(input) {
  if (input.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  }

  const auth = verifyVocClassifierBearer(input.authorization);
  if (!auth.ok) {
    return { status: 401, body: { ok: false, error: 'Unauthorized', code: auth.code } };
  }

  try {
    const { prepareVocUnitsFromSource } = await import('./voc-prepare-core.mjs');
    const result = prepareVocUnitsFromSource(input.body ?? {});
    const status = result.ok ? 200 : 400;
    return { status, body: result };
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, code: 'PREPARE_FAILED', error: sanitizeHttpError(err) },
    };
  }
}

/** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} res */
export async function handleVocClassifyVercel(req, res) {
  const body = await readJsonBody(req);
  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  const out = await executeVocClassifyHttpRequest({
    method: req.method,
    authorization: auth,
    body,
  });
  sendJson(res, out.status, out.body);
}

export async function handleVocPrepareVercel(req, res) {
  const body = await readJsonBody(req);
  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  const out = await executeVocPrepareHttpRequest({
    method: req.method,
    authorization: auth,
    body,
  });
  sendJson(res, out.status, out.body);
}

export async function handleVocClassifyHealthVercel(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }
  sendJson(res, 200, buildVocClassifyHealthPayload());
}

async function readJsonBody(req) {
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
  return body ?? {};
}

function sendJson(res, status, body) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(body);
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}
