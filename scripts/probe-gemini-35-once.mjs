import './load-dotenv.mjs';
import crypto from 'crypto';
import { loadVocAiConfig } from '../lib/analytics/voc-ai-config.mjs';
import { geminiApiFetch, sanitizeGeminiErrorMessage } from '../lib/analytics/voc-gemini-http.mjs';

const { apiKey, hasApiKey } = loadVocAiConfig();
if (!hasApiKey) {
  console.log(JSON.stringify({ error: 'GEMINI_API_KEY missing' }));
  process.exit(1);
}

const fingerprint = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
const path = '/models/gemini-3.5-flash:generateContent';
const body = JSON.stringify({
  contents: [{ role: 'user', parts: [{ text: 'Return JSON: {"ping":1}' }] }],
  generationConfig: { temperature: 0, responseMimeType: 'application/json' },
});

const { res, latency_ms } = await geminiApiFetch(apiKey, path, { method: 'POST', body });
const raw = await res.text();
const sanitized = sanitizeGeminiErrorMessage(raw);

let parsed = null;
try {
  parsed = JSON.parse(raw);
} catch {
  /* ignore */
}

const out = {
  key_fingerprint_sha256_12: fingerprint,
  key_length: apiKey.length,
  model: 'gemini-3.5-flash',
  http_status: res.status,
  latency_ms,
  passed: res.ok,
  error_status: parsed?.error?.status ?? null,
  error_code: parsed?.error?.code ?? null,
  message_sanitized: (parsed?.error?.message ?? sanitized).slice(0, 350),
};
console.log(JSON.stringify(out, null, 2));
process.exit(res.ok ? 0 : 1);
