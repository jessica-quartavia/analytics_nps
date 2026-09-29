import { buildGeminiSystemInstruction, buildGeminiUserPayload } from './voc-gemini-prompt.mjs';
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fallbackReasonFromErrorCode(code) {
  const map = {
    GEMINI_AUTH_FAILED: 'auth_failed',
    GEMINI_FORBIDDEN: 'auth_failed',
    GEMINI_MODEL_NOT_AVAILABLE: 'model_not_available',
    GEMINI_RATE_LIMIT: 'rate_limit',
    GEMINI_TIMEOUT: 'timeout',
    GEMINI_BAD_REQUEST: 'unknown',
    GEMINI_INVALID_OUTPUT: 'invalid_json',
    GEMINI_SCHEMA_INVALID: 'schema_invalid',
    GEMINI_SERVER_ERROR: 'server_error',
    GEMINI_UNKNOWN: 'unknown',
  };
  return map[code] ?? 'unknown';
}

const CLASSIFIER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          valence: { type: 'string' },
          confidence: { type: 'number' },
          evidence: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['theme', 'valence', 'confidence', 'evidence', 'reason'],
      },
    },
    no_additional_comment: { type: 'boolean' },
  },
  required: ['classifications'],
};

/**
 * @param {object} config from loadVocAiConfig
 * @param {{ fetchFn?: typeof fetch }} [deps]
 */
export function createGeminiValenceClient(config, deps = {}) {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;

  /**
   * @param {{ score: number|null, nps_category: string|null, segments: Array<object> }} payload
   */
  async function classifyValence(payload) {
    const userText = buildGeminiUserPayload(payload);
    const system = buildGeminiSystemInstruction();
    const path = generateContentPath(config.model);

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: CLASSIFIER_RESPONSE_SCHEMA,
      },
    };

    let lastResult = { ok: false, error: 'Gemini falhou', errorCode: 'GEMINI_UNKNOWN', fallback_reason: 'unknown' };

    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
      if (attempt > 0) {
        await sleep(Math.min(8000, 500 * 2 ** attempt));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const { res, latency_ms, url } = await geminiApiFetch(
          config.apiKey,
          path,
          {
            method: 'POST',
            body: JSON.stringify(body),
            signal: controller.signal,
          },
          { fetchFn },
        );
        clearTimeout(timer);

        const rawText = await res.text();
        const errMsg = sanitizeGeminiErrorMessage(rawText);

        if (res.status === 429 || res.status >= 500) {
          const code = geminiErrorCodeFromHttp(res.status, errMsg);
          lastResult = {
            ok: false,
            error: errMsg,
            errorCode: code,
            http_status: res.status,
            latency_ms,
            endpoint: url,
            fallback_reason: fallbackReasonFromErrorCode(code),
          };
          continue;
        }

        if (!res.ok) {
          const code = geminiErrorCodeFromHttp(res.status, errMsg);
          return {
            ok: false,
            error: errMsg,
            errorCode: code,
            http_status: res.status,
            latency_ms,
            endpoint: url,
            fallback_reason: fallbackReasonFromErrorCode(code),
          };
        }

        const httpParsed = parseGeminiApiHttpBody(rawText);
        if (!httpParsed.ok) {
          return {
            ok: false,
            error: 'Corpo HTTP da API não é JSON válido',
            errorCode: 'GEMINI_INVALID_OUTPUT',
            http_status: res.status,
            latency_ms,
            endpoint: url,
            parse_error: httpParsed.parse_error,
            fallback_reason: 'invalid_json',
          };
        }

        const modelText = extractCandidateTextFromApiData(httpParsed.data);
        if (!modelText) {
          return {
            ok: false,
            error: 'Gemini resposta vazia',
            errorCode: 'GEMINI_INVALID_OUTPUT',
            http_status: res.status,
            latency_ms,
            endpoint: url,
            fallback_reason: 'invalid_json',
          };
        }

        const jsonParsed = parseClassifierJsonFromModelText(modelText);
        if (!jsonParsed.ok) {
          return {
            ok: false,
            error: 'Gemini JSON malformado no conteúdo',
            errorCode: 'GEMINI_INVALID_OUTPUT',
            http_status: res.status,
            latency_ms,
            endpoint: url,
            parse_error: jsonParsed.parse_error,
            model_text_preview: jsonParsed.sanitized_preview,
            fallback_reason: 'invalid_json',
          };
        }

        return {
          ok: true,
          data: jsonParsed.data,
          http_status: res.status,
          latency_ms,
          endpoint: url,
        };
      } catch (err) {
        clearTimeout(timer);
        const isTimeout = err.name === 'AbortError';
        const code = isTimeout ? 'GEMINI_TIMEOUT' : 'GEMINI_UNKNOWN';
        lastResult = {
          ok: false,
          error: sanitizeGeminiErrorMessage(isTimeout ? 'timeout' : err.message),
          errorCode: code,
          fallback_reason: fallbackReasonFromErrorCode(code),
        };
        if (attempt >= config.retries) break;
      }
    }
    return lastResult;
  }

  return { classifyValence };
}
