import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  listGeminiGenerateContentModels,
  assertGeminiModelAvailable,
  normalizeModelId,
  GeminiModelNotAvailableError,
} from '../lib/analytics/voc-gemini-models.mjs';

describe('voc-gemini-models', () => {
  it('normalizeModelId remove prefixo models/', () => {
    assert.equal(normalizeModelId('models/gemini-1.5-flash'), 'gemini-1.5-flash');
    assert.equal(normalizeModelId('gemini-1.5-flash'), 'gemini-1.5-flash');
  });

  it('lista modelos generateContent', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    });
    const list = await listGeminiGenerateContentModels('key', { fetchFn });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'gemini-1.5-flash');
  });

  it('GEMINI_MODEL_NOT_AVAILABLE quando modelo ausente', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] }],
      }),
    });
    await assert.rejects(() => assertGeminiModelAvailable('key', 'gemini-2.0-flash', { fetchFn }), (err) => {
      assert.equal(err.code, 'GEMINI_MODEL_NOT_AVAILABLE');
      assert.ok(err.availableGenerateContentModels.includes('gemini-1.5-flash'));
      return true;
    });
  });
});
