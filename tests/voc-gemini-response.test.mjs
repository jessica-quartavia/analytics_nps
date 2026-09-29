import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  probeGeminiGenerateContent,
  GeminiApiError,
} from '../lib/analytics/voc-gemini-models.mjs';
import {
  parseGeminiApiHttpBody,
  extractCandidateTextFromApiData,
  parseClassifierJsonFromModelText,
} from '../lib/analytics/voc-gemini-response.mjs';
import { createGeminiValenceClient } from '../lib/analytics/voc-gemini-client.mjs';
import { loadVocAiConfig } from '../lib/analytics/voc-ai-config.mjs';
import { geminiErrorCodeFromHttp } from '../lib/analytics/voc-gemini-http.mjs';

function mockApiJsonResponse(modelText, { status = 200 } = {}) {
  const body = JSON.stringify({
    candidates: [{ content: { parts: [{ text: modelText }] } }],
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

describe('voc-gemini-response', () => {
  it('HTTP 200 + text "OK" → probe SUCCESS', async () => {
    const longPadding = 'x'.repeat(600);
    const apiBody = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'OK' }] } }],
      metadata: longPadding,
    });
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      text: async () => apiBody,
    });
    const probe = await probeGeminiGenerateContent('key', 'gemini-3.6-flash', { fetchFn });
    assert.equal(probe.http_status, 200);
    assert.equal(probe.text, 'OK');
  });

  it('HTTP 200 + JSON válido → classificador SUCCESS', async () => {
    const payload = JSON.stringify({
      classifications: [
        {
          theme: 'Atendimento / relacionamento',
          valence: 'Positiva',
          confidence: 0.9,
          evidence: 'ótimo atendimento',
          reason: 'explicit_positive',
        },
      ],
    });
    const fetchFn = async () => mockApiJsonResponse(payload);
    const config = loadVocAiConfig({ GEMINI_API_KEY: 'k', VOC_AI_MODEL: 'gemini-3.6-flash' });
    const client = createGeminiValenceClient(config, { fetchFn });
    const result = await client.classifyValence({ score: 10, nps_category: 'Promotor', segments: [] });
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.data.classifications));
  });

  it('HTTP 200 + texto não JSON no classificador → GEMINI_INVALID_OUTPUT', async () => {
    const fetchFn = async () => mockApiJsonResponse('not json at all');
    const config = loadVocAiConfig({ GEMINI_API_KEY: 'k', VOC_AI_MODEL: 'gemini-3.6-flash' });
    const client = createGeminiValenceClient(config, { fetchFn });
    const result = await client.classifyValence({ score: 10, nps_category: 'Promotor', segments: [] });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'GEMINI_INVALID_OUTPUT');
    assert.equal(result.http_status, 200);
    assert.ok(result.parse_error);
  });

  it('HTTP 400 → GEMINI_BAD_REQUEST', () => {
    assert.equal(geminiErrorCodeFromHttp(400), 'GEMINI_BAD_REQUEST');
  });

  it('HTTP 503 → GEMINI_SERVER_ERROR', () => {
    assert.equal(geminiErrorCodeFromHttp(503), 'GEMINI_SERVER_ERROR');
  });

  it('parseGeminiApiHttpBody + extractCandidateText', () => {
    const raw = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }],
    });
    const parsed = parseGeminiApiHttpBody(raw);
    assert.equal(parsed.ok, true);
    assert.equal(extractCandidateTextFromApiData(parsed.data), 'ab');
  });

  it('parseClassifierJsonFromModelText remove fence', () => {
    const v = parseClassifierJsonFromModelText('```json\n{"classifications":[]}\n```');
    assert.equal(v.ok, true);
    assert.deepEqual(v.data.classifications, []);
  });

  it('probe HTTP 400 lança GEMINI_BAD_REQUEST', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"bad"}}',
    });
    await assert.rejects(
      () => probeGeminiGenerateContent('key', 'gemini-3.6-flash', { fetchFn }),
      (err) => {
        assert.ok(err instanceof GeminiApiError);
        assert.equal(err.code, 'GEMINI_BAD_REQUEST');
        return true;
      },
    );
  });
});
