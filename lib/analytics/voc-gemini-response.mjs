import { sanitizeGeminiErrorMessage } from './voc-gemini-http.mjs';

/**
 * Parse do corpo HTTP da API Gemini (JSON). Não sanitizar/truncar antes do parse.
 * @param {string} rawText
 */
export function parseGeminiApiHttpBody(rawText) {
  try {
    return { ok: true, data: JSON.parse(rawText) };
  } catch (err) {
    return {
      ok: false,
      parse_error: err instanceof Error ? err.message : 'JSON.parse failed',
    };
  }
}

/**
 * Texto gerado pelo modelo a partir do envelope da API.
 * @param {unknown} apiData
 */
export function extractCandidateTextFromApiData(apiData) {
  const parts = apiData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

/** Remove fence ```json ... ``` externo (classificador VoC). */
export function stripJsonCodeFence(text) {
  let t = String(text ?? '').trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return t;
}

/**
 * Parse JSON estruturado exigido pelo classificador VoC.
 * @param {string} modelText
 */
export function parseClassifierJsonFromModelText(modelText) {
  const stripped = stripJsonCodeFence(modelText);
  try {
    const data = JSON.parse(stripped);
    if (!data || typeof data !== 'object') {
      return { ok: false, parse_error: 'root não é objeto' };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      parse_error: err instanceof Error ? err.message : 'JSON.parse failed',
      sanitized_preview: sanitizeGeminiErrorMessage(stripped).slice(0, 400),
    };
  }
}
