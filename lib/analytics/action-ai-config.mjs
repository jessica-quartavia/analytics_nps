export const ACTION_GEMINI_CLASSIFIER_VERSION = 'action_gemini_v1';
export const ACTION_GEMINI_PROMPT_VERSION = 'action-gemini-prompt-v1';

/**
 * Config server-side para classificação do Plano de Ação (Gemini).
 */
export function loadActionAiConfig(env = process.env) {
  const apiKey = String(env.GEMINI_API_KEY ?? '').trim();
  const model = String(env.ACTION_AI_MODEL ?? env.VOC_AI_MODEL ?? 'gemini-3.6-flash').trim();
  const useGemini =
    env.ACTION_USE_GEMINI === '1' ||
    env.ACTION_USE_GEMINI === 'true' ||
    env.VOC_USE_GEMINI === '1' ||
    env.VOC_USE_GEMINI === 'true';
  const hasApiKey = Boolean(apiKey);
  const hasModel = Boolean(model);
  return {
    provider: env.ACTION_AI_PROVIDER ?? env.VOC_AI_PROVIDER ?? 'gemini',
    model,
    apiKey,
    hasApiKey,
    hasModel,
    useGemini,
    geminiConfigured: hasApiKey && hasModel,
    geminiActivated: hasApiKey && hasModel && useGemini,
    concurrency: Math.max(1, Math.min(10, Number(env.ACTION_AI_CONCURRENCY ?? env.VOC_AI_CONCURRENCY ?? 4))),
    retries: Math.max(0, Math.min(6, Number(env.ACTION_AI_RETRIES ?? env.VOC_AI_RETRIES ?? 3))),
    timeoutMs: Math.max(5000, Number(env.ACTION_AI_TIMEOUT_MS ?? env.VOC_AI_TIMEOUT_MS ?? 28_000)),
    classifierVersion: ACTION_GEMINI_CLASSIFIER_VERSION,
    promptVersion: ACTION_GEMINI_PROMPT_VERSION,
  };
}

/** QA: falhar em vez de rules_fallback quando Gemini não responder. */
export function isActionGeminiRequired(env = process.env) {
  return env.ACTION_REQUIRE_GEMINI === '1' || env.ACTION_REQUIRE_GEMINI === 'true';
}
