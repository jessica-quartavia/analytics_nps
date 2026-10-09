import { classifyCommentWithRules } from './voc-classifier.mjs';
import { loadVocAiConfig, VOC_GEMINI_CLASSIFIER_VERSION, VOC_GEMINI_PROMPT_VERSION } from './voc-ai-config.mjs';
import { createGeminiValenceClient } from './voc-gemini-client.mjs';
import { validateGeminiClassificationResponse } from './voc-ai-validate.mjs';
import { applySemanticReviewFlags } from './voc-semantic-validate.mjs';
import { needsHumanReview } from '../persistence/voc-supabase-store.mjs';

function rulesFallbackForUnit(input, reason) {
  const syntheticComment = `${input.question ?? ''}\n${input.answer ?? ''}`.trim();
  const mentions = classifyCommentWithRules(syntheticComment, { npsScore: input.score ?? null });
  const allowed = new Set(input.candidate_themes ?? []);
  const filtered = mentions.filter((m) => allowed.has(m.topic));
  const baseRows = (filtered.length ? filtered : mentions.slice(0, 1)).map((m) => ({
    theme: m.topic,
    valence: m.valence,
    confidence: Math.round((m.confidence ?? 0.68) * 1000) / 1000,
    evidence: (input.answer ?? '').slice(0, 280),
    valence_reason: m.valence_reason ?? reason ?? 'rules_fallback',
    needs_human_review: needsHumanReview({
      confidence: m.confidence ?? 0.68,
      npsCategory: input.nps_category,
      valence: m.valence,
    }).needs,
  }));
  const question = String(input.question ?? '').trim();
  const answer = String(input.answer ?? '').trim();
  const withReview = applySemanticReviewFlags(baseRows, {
    question,
    answer,
    score: input.score ?? null,
    nps_category: input.nps_category ?? null,
  });
  const rows = withReview.map((c) => ({
    theme: c.theme,
    valence: c.valence,
    confidence: c.confidence,
    evidence: c.evidence,
    valence_reason: c.valence_reason,
    needs_human_review: c.needs_human_review,
    semantic_conflict: c.semantic_conflict ?? false,
    score_text_conflict: c.score_text_conflict ?? false,
  }));
  return {
    ok: true,
    classifier_source: 'rules_v2_fallback',
    classifier_version: VOC_GEMINI_CLASSIFIER_VERSION,
    provider: 'rules',
    model: null,
    fallback_reason: reason,
    classifications: rows,
  };
}

/**
 * Classifica uma unidade VoC (stateless — sem cache/banco).
 * @param {object} input
 * @param {string} input.response_id
 * @param {number|null} [input.score]
 * @param {string|null} [input.nps_category]
 * @param {string} input.question
 * @param {string} input.answer
 * @param {string[]} input.candidate_themes
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function classifyVocUnit(input, env = process.env) {
  const config = loadVocAiConfig(env);
  const question = String(input.question ?? '').trim();
  const answer = String(input.answer ?? '').trim();
  const candidateThemes = [...(input.candidate_themes ?? [])];
  if (!answer || !candidateThemes.length) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'answer e candidate_themes são obrigatórios',
    };
  }

  const allowedThemes = new Set(candidateThemes);
  const cachePayload = {
    score: input.score ?? null,
    nps_category: input.nps_category ?? null,
    segments: [{ question, answer, candidate_themes: candidateThemes }],
  };

  if (!config.geminiConfigured || !config.useGemini) {
    const reason = !config.hasApiKey ? 'missing_key' : !config.hasModel ? 'model_not_available' : 'gemini_disabled';
    return rulesFallbackForUnit(input, reason);
  }

  const client = createGeminiValenceClient(config);
  const apiResult = await client.classifyValence(cachePayload);

  if (!apiResult.ok) {
    return rulesFallbackForUnit(input, apiResult.fallback_reason ?? apiResult.errorCode ?? 'gemini_error');
  }

  const validated = validateGeminiClassificationResponse(apiResult.data, allowedThemes);
  if (!validated.ok) {
    return rulesFallbackForUnit(input, 'schema_invalid');
  }

  if (validated.classifications.length === 0) {
    return {
      ok: true,
      classifier_source: 'gemini',
      classifier_version: VOC_GEMINI_CLASSIFIER_VERSION,
      provider: config.provider,
      model: config.model,
      prompt_version: VOC_GEMINI_PROMPT_VERSION,
      classifications: [],
      no_additional_comment: validated.no_additional_comment,
    };
  }

  const withReview = applySemanticReviewFlags(
    validated.classifications.map((c) => ({
      theme: c.theme,
      valence: c.valence,
      confidence: c.confidence,
      evidence: c.evidence,
      reason: c.reason,
      needs_human_review: needsHumanReview({
        confidence: c.confidence,
        npsCategory: input.nps_category,
        valence: c.valence,
      }).needs,
    })),
    { question, answer, score: input.score ?? null, nps_category: input.nps_category ?? null },
  );

  const classifications = withReview.map((c) => ({
    theme: c.theme,
    valence: c.valence,
    confidence: c.confidence,
    evidence: c.evidence,
    valence_reason: c.reason,
    needs_human_review: c.needs_human_review,
    semantic_conflict: c.semantic_conflict ?? false,
    score_text_conflict: c.score_text_conflict ?? false,
  }));

  return {
    ok: true,
    classifier_source: 'gemini',
    classifier_version: VOC_GEMINI_CLASSIFIER_VERSION,
    provider: config.provider,
    model: config.model,
    prompt_version: VOC_GEMINI_PROMPT_VERSION,
    classifications,
  };
}
