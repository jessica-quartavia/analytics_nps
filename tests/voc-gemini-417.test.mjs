import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGeminiClassificationResponse } from '../lib/analytics/voc-ai-validate.mjs';
import { isNoAdditionalCommentAnswer, buildVocValenceUnits } from '../lib/analytics/voc-ai-segments.mjs';
import { classifyResponseValenceWithAi } from '../lib/analytics/voc-ai-classifier.mjs';
import { loadVocAiConfig, VOC_GEMINI_CLASSIFIER_VERSION } from '../lib/analytics/voc-ai-config.mjs';
import { classifyCommentWithRules } from '../lib/analytics/voc-classifier.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ADEMIR = `Qual o principal motivo da sua nota?: Conhecimento, atenção, proatividade e vontade de ajudar no processo de construção do patrimônio

Qual a principal razão para a sua nota 9 ou 10? O que mais te agradou em sua experiência?: Atendimento personalizado e estruturado

O que te faria continuar com a gente por mais 5 anos sem hesitar?: Clareza dos próximos passos e visão de todas as oportunidades que podem ser geradas

Você gostaria de adicionar algum outro comentário sobre a sua experiência com a QuartaVia?: Estou feliz com esta oportunidade e ansioso para os próximos passos`;

const LENIS = `"Atenção dispensada"
"O atendimento sempre que precisamos"
"Se houvesse a garantia dos resultados prometidos."`;

function mockGeminiClient(mapFn) {
  return {
    classifyValence: async (payload) => {
      const data = mapFn(payload);
      if (data === null) return { ok: false, error: 'mock fail' };
      return { ok: true, data };
    },
  };
}

describe('VoC Gemini 4.17', () => {
  it('valida JSON Gemini — tema/valência/confidence', () => {
    const allowed = new Set(['Clareza / comunicação']);
    const v = validateGeminiClassificationResponse(
      {
        classifications: [
          {
            theme: 'Clareza / comunicação',
            valence: 'Positiva',
            confidence: 0.94,
            evidence: 'clareza na estratégia',
            reason: 'explicit_positive',
          },
        ],
      },
      allowed,
    );
    assert.equal(v.ok, true);
    assert.equal(v.classifications.length, 1);
  });

  it('rejeita tema inválido', () => {
    const v = validateGeminiClassificationResponse(
      { classifications: [{ theme: 'Tema Inventado', valence: 'Positiva', confidence: 0.9, evidence: 'x' }] },
      new Set(['Tema Inventado']),
    );
    assert.equal(v.ok, false);
  });

  it('"não" em comentário adicional não gera unidades', () => {
    const comment = `O que te faria continuar?: atingir objetivos

Você gostaria de adicionar algum outro comentário sobre a sua experiência com a QuartaVia?: não`;
    assert.ok(isNoAdditionalCommentAnswer('não'));
    const { units, skippedNoAdditional } = buildVocValenceUnits(comment);
    assert.ok(skippedNoAdditional);
    assert.ok(!units.some((u) => u.answer.toLowerCase() === 'não'));
  });

  it('fallback rules_v2 sem API key', async () => {
    const rows = await classifyResponseValenceWithAi(
      {
        response_id: 'r1',
        analytical_cycle_code: 'C',
        score: 10,
        comment: 'Atendimento excelente, mas ainda não vi resultado.',
      },
      {
        config: {
          ...loadVocAiConfig({}),
          hasApiKey: false,
          hasModel: false,
          geminiConfigured: false,
          classifierVersion: VOC_GEMINI_CLASSIFIER_VERSION,
          provider: 'gemini',
          model: '',
          promptVersion: 'v1',
          concurrency: 1,
          retries: 0,
          timeoutMs: 1000,
        },
        stats: {},
        skipNetwork: true,
      },
    );
    assert.ok(rows.length >= 2);
    assert.equal(rows[0].classifier_source, 'rules_v2_fallback');
  });

  it('timeout/falha Gemini → fallback explícito', async () => {
    const rows = await classifyResponseValenceWithAi(
      {
        response_id: 'r2',
        analytical_cycle_code: 'C',
        score: 10,
        comment: 'Confio no engenheiro patrimonial.',
      },
      {
        config: {
          ...loadVocAiConfig({ GEMINI_API_KEY: 'x', VOC_AI_MODEL: 'gemini-test' }),
          hasApiKey: true,
          hasModel: true,
          geminiConfigured: true,
          classifierVersion: VOC_GEMINI_CLASSIFIER_VERSION,
        },
        stats: {},
        geminiClient: mockGeminiClient(() => null),
        cacheDoc: { version: 1, entries: {} },
      },
    );
    assert.equal(rows[0].classifier_source, 'rules_v2_fallback');
  });

  it('Aguinaldo — mock Gemini semântico', async () => {
    const responses = JSON.parse(readFileSync(join(root, 'data/processed/responses.json'), 'utf8'));
    const ag = responses.find((r) => r.client_name?.includes('Aguinaldo Vieira'));
    assert.ok(ag);
    const client = mockGeminiClient((payload) => {
      const allowed = new Set(payload.segments.flatMap((s) => s.candidate_themes));
      const all = [
        {
          theme: 'Clareza / comunicação',
          valence: 'Positiva',
          confidence: 0.92,
          evidence: 'clareza na construção de estratégia patrimonil',
          reason: 'explicit_positive',
        },
        {
          theme: 'Plano patrimonial',
          valence: 'Positiva',
          confidence: 0.9,
          evidence: 'visão diferenciada para alavancagem',
          reason: 'explicit_positive',
        },
        {
          theme: 'Resultados',
          valence: 'Neutra',
          confidence: 0.78,
          evidence: 'atingir os meus objetivos',
          reason: 'prospective_neutral',
        },
      ];
      return {
        classifications: all.filter((c) => allowed.has(c.theme)),
      };
    });
    const rows = await classifyResponseValenceWithAi(ag, {
      config: {
        ...loadVocAiConfig({ GEMINI_API_KEY: 'test', VOC_AI_MODEL: 'gemini-test' }),
        hasApiKey: true,
        hasModel: true,
        geminiConfigured: true,
      },
      stats: {},
      geminiClient: client,
      cacheDoc: { version: 1, entries: {} },
    });
    assert.ok(rows.some((r) => r.topic === 'Clareza / comunicação' && r.valence === 'Positiva'));
    assert.ok(rows.some((r) => r.topic === 'Plano patrimonial' && r.valence === 'Positiva'));
    const res = rows.find((r) => r.topic === 'Resultados');
    if (res) assert.equal(res.valence, 'Neutra');
    assert.equal(rows[0].classifier_source, 'gemini');
  });

  it('Ademir — rules_v2 baseline elogios', () => {
    const m = classifyCommentWithRules(ADEMIR, { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Atendimento / relacionamento')?.valence, 'Positiva');
    assert.equal(m.find((x) => x.topic === 'Clareza / comunicação')?.valence, 'Positiva');
  });

  it('Lenis — crítica real preservada (rules)', () => {
    const m = classifyCommentWithRules(LENIS, { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Atendimento / relacionamento')?.valence, 'Positiva');
    assert.ok(m.some((x) => x.valence === 'Negativa'));
  });
});
