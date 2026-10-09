import {
  buildActionGeminiSystemInstruction,
  buildActionGeminiUserPayload,
  ACTION_PRIORITIES,
  ACTION_URGENCIES,
  ACTION_CATEGORIES,
  OWNER_AREAS,
} from './action-gemini-prompt.mjs';
import {
  geminiApiFetch,
  geminiErrorCodeFromHttp,
  sanitizeGeminiErrorMessage,
  generateContentPath,
} from './voc-gemini-http.mjs';
import {
  parseGeminiApiHttpBody,
  extractCandidateTextFromApiData,
  parseClassifierJsonFromModelText,
} from './voc-gemini-response.mjs';

const ACTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    theme: { type: 'string' },
    priority: { type: 'string' },
    urgency: { type: 'string' },
    action_category: { type: 'string' },
    suggested_owner_area: { type: 'string' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
    evidence: { type: 'string' },
    main_problem: { type: 'string' },
    recommended_action: { type: 'string' },
  },
  required: [
    'theme',
    'priority',
    'urgency',
    'action_category',
    'suggested_owner_area',
    'confidence',
    'reason',
    'evidence',
    'main_problem',
    'recommended_action',
  ],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function inList(value, list) {
  return list.includes(String(value ?? '').trim());
}

function fallbackReasonFromErrorCode(code) {
  const map = {
    GEMINI_RATE_LIMIT: 'rate_limit',
    GEMINI_TIMEOUT: 'timeout',
    GEMINI_SERVER_ERROR: 'server_error',
    GEMINI_INVALID_OUTPUT: 'invalid_json',
    GEMINI_MODEL_NOT_AVAILABLE: 'model_not_available',
  };
  return map[code] ?? 'unknown';
}

/**
 * @param {object} config from loadActionAiConfig
 */
export function createActionGeminiClient(config, deps = {}) {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;

  async function classifyActionItem(item) {
    const userText = buildActionGeminiUserPayload(item);
    const system = buildActionGeminiSystemInstruction();
    const path = generateContentPath(config.model);
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: ACTION_RESPONSE_SCHEMA,
      },
    };

    let lastResult = { ok: false, errorCode: 'GEMINI_UNKNOWN', fallback_reason: 'unknown' };

    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
      if (attempt > 0) await sleep(Math.min(8000, 500 * 2 ** attempt));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const { res } = await geminiApiFetch(
          config.apiKey,
          path,
          { method: 'POST', body: JSON.stringify(body), signal: controller.signal },
          { fetchFn },
        );
        clearTimeout(timer);
        const rawText = await res.text();
        const errMsg = sanitizeGeminiErrorMessage(rawText);

        if (res.status === 429 || res.status >= 500) {
          const code = geminiErrorCodeFromHttp(res.status, errMsg);
          lastResult = { ok: false, errorCode: code, fallback_reason: fallbackReasonFromErrorCode(code) };
          continue;
        }

        if (!res.ok) {
          const code = geminiErrorCodeFromHttp(res.status, errMsg);
          return { ok: false, errorCode: code, fallback_reason: fallbackReasonFromErrorCode(code) };
        }

        const httpParsed = parseGeminiApiHttpBody(rawText);
        if (!httpParsed.ok) {
          return { ok: false, errorCode: 'GEMINI_INVALID_OUTPUT', fallback_reason: 'invalid_json' };
        }

        const modelText = extractCandidateTextFromApiData(httpParsed.data);
        const jsonParsed = parseClassifierJsonFromModelText(modelText);
        if (!jsonParsed.ok) {
          return { ok: false, errorCode: 'GEMINI_INVALID_OUTPUT', fallback_reason: 'invalid_json' };
        }

        const row = jsonParsed.data;
        if (!inList(row.priority, ACTION_PRIORITIES)) row.priority = 'Média';
        if (!inList(row.urgency, ACTION_URGENCIES)) row.urgency = 'Média';
        if (!inList(row.action_category, ACTION_CATEGORIES)) row.action_category = 'Acompanhar';
        if (!inList(row.suggested_owner_area, OWNER_AREAS)) row.suggested_owner_area = 'Não informado';
        row.confidence = Math.max(0, Math.min(1, Number(row.confidence) || 0.5));
        return { ok: true, data: row };
      } catch (err) {
        clearTimeout(timer);
        const code = err.name === 'AbortError' ? 'GEMINI_TIMEOUT' : 'GEMINI_UNKNOWN';
        lastResult = { ok: false, errorCode: code, fallback_reason: fallbackReasonFromErrorCode(code) };
      }
    }
    return lastResult;
  }

  return { classifyActionItem };
}
