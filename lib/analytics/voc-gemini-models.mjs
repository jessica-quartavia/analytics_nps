/**
 * Listagem e validação de modelos Gemini (server-side, REST + x-goog-api-key).
 */
import {
  geminiApiFetch,
  geminiErrorCodeFromHttp,
  sanitizeGeminiErrorMessage,
  modelsListPath,
  generateContentPath,
} from './voc-gemini-http.mjs';
import { parseGeminiApiHttpBody, extractCandidateTextFromApiData } from './voc-gemini-response.mjs';

export class GeminiModelNotAvailableError extends Error {
  constructor(model, availableIds) {
    super('GEMINI_MODEL_NOT_AVAILABLE');
    this.name = 'GeminiModelNotAvailableError';
    this.code = 'GEMINI_MODEL_NOT_AVAILABLE';
    this.model = model;
    this.availableGenerateContentModels = availableIds;
  }
}

export class GeminiModelNotConfiguredError extends Error {
  constructor() {
    super('VOC_AI_MODEL is required when GEMINI_API_KEY is set');
    this.name = 'GeminiModelNotConfiguredError';
    this.code = 'GEMINI_MODEL_NOT_CONFIGURED';
  }
}

export class GeminiApiError extends Error {
  /**
   * @param {string} code
   * @param {object} details
   */
  constructor(code, details) {
    super(code);
    this.name = 'GeminiApiError';
    this.code = code;
    this.details = details;
  }
}

/** @param {string} name e.g. models/gemini-1.5-flash */
export function normalizeModelId(name) {
  const n = String(name ?? '').trim();
  if (!n) return '';
  return n.startsWith('models/') ? n.slice('models/'.length) : n;
}

/**
 * @param {string} apiKey
 * @param {{ fetchFn?: typeof fetch }} [deps]
 */
export async function listGeminiGenerateContentModels(apiKey, deps = {}) {
  const { res, latency_ms, url } = await geminiApiFetch(apiKey, modelsListPath(), { method: 'GET' }, deps);
  if (!res.ok) {
    const t = sanitizeGeminiErrorMessage(await res.text());
    const code = geminiErrorCodeFromHttp(res.status, t);
    throw new GeminiApiError(code, { http_status: res.status, error_message: t, endpoint: url, latency_ms });
  }
  const data = await res.json();
  const models = data.models ?? [];
  return models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => ({
      id: normalizeModelId(m.name),
      name: m.name,
      displayName: m.displayName ?? m.name,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * @param {string} apiKey
 * @param {string} modelId
 * @param {{ fetchFn?: typeof fetch }} [deps]
 */
export async function assertGeminiModelAvailable(apiKey, modelId, deps = {}) {
  const wanted = normalizeModelId(modelId);
  if (!wanted) throw new GeminiModelNotConfiguredError();
  const available = await listGeminiGenerateContentModels(apiKey, deps);
  const ids = available.map((m) => m.id);
  if (!ids.includes(wanted)) {
    throw new GeminiModelNotAvailableError(wanted, ids);
  }
  return { model: wanted, available };
}

/**
 * Probe generateContent — falha com GeminiApiError (sem fallback).
 * @returns {{ http_status: number, latency_ms: number, text: string, endpoint: string }}
 */
export async function probeGeminiGenerateContent(apiKey, modelId, deps = {}) {
  const model = normalizeModelId(modelId);
  const path = generateContentPath(model);
  const { res, latency_ms, url } = await geminiApiFetch(
    apiKey,
    path,
    {
      method: 'POST',
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Responda somente com OK' }] }],
      }),
    },
    deps,
  );
  const rawBody = await res.text();
  if (!res.ok) {
    const bodyText = sanitizeGeminiErrorMessage(rawBody);
    const code = geminiErrorCodeFromHttp(res.status, bodyText);
    throw new GeminiApiError(code, {
      http_status: res.status,
      error_message: bodyText,
      model,
      endpoint: url,
      latency_ms,
    });
  }

  const parsed = parseGeminiApiHttpBody(rawBody);
  if (!parsed.ok) {
    throw new GeminiApiError('GEMINI_INVALID_OUTPUT', {
      http_status: res.status,
      error_message: 'Corpo HTTP da API não é JSON válido',
      parse_error: parsed.parse_error,
      model,
      endpoint: url,
      latency_ms,
    });
  }

  const text = extractCandidateTextFromApiData(parsed.data);
  if (!text) {
    throw new GeminiApiError('GEMINI_INVALID_OUTPUT', {
      http_status: res.status,
      error_message: 'Resposta HTTP 200 sem candidates[0].content.parts[].text',
      model,
      endpoint: url,
      latency_ms,
    });
  }

  return { http_status: res.status, latency_ms, text, endpoint: url, model };
}
