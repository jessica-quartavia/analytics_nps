const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** @param {string} msg */
export function sanitizeGeminiErrorMessage(msg) {
  return String(msg ?? '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
    .slice(0, 500);
}

/**
 * @param {number} status
 * @param {string} [message]
 */
export function geminiErrorCodeFromHttp(status, message = '') {
  if (status === 400) return 'GEMINI_BAD_REQUEST';
  if (status === 401) return 'GEMINI_AUTH_FAILED';
  if (status === 403) return 'GEMINI_FORBIDDEN';
  if (status === 404) return 'GEMINI_MODEL_NOT_AVAILABLE';
  if (status === 429) return 'GEMINI_RATE_LIMIT';
  if (status >= 500) return 'GEMINI_SERVER_ERROR';
  if (/timeout|abort/i.test(message)) return 'GEMINI_TIMEOUT';
  return 'GEMINI_UNKNOWN';
}

/**
 * @param {string} apiKey
 * @param {string} path — ex. /models ou /models/x:generateContent
 * @param {RequestInit} [init]
 * @param {{ fetchFn?: typeof fetch }} [deps]
 */
export async function geminiApiFetch(apiKey, path, init = {}, deps = {}) {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const url = path.startsWith('http') ? path : `${GEMINI_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...(init.headers ?? {}),
  };
  const started = Date.now();
  const res = await fetchFn(url, { ...init, headers });
  const latency_ms = Date.now() - started;
  return { res, latency_ms, url };
}

export function modelsListPath() {
  return '/models';
}

export function generateContentPath(modelId) {
  const id = String(modelId ?? '').replace(/^models\//, '');
  return `/models/${encodeURIComponent(id)}:generateContent`;
}
