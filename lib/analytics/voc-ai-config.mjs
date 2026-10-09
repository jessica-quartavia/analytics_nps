/** Versão do classificador IA (auditoria). */
export const VOC_GEMINI_CLASSIFIER_VERSION = 'gemini_v1';

/** Versão do prompt (cache / idempotência). */
export const VOC_GEMINI_PROMPT_VERSION = 'voc-gemini-prompt-v3';

/**
 * Configuração central — somente server-side / scripts (nunca dashboard).
 * VOC_AI_MODEL é obrigatório quando GEMINI_API_KEY está definida (sem default fixo).
 */
export function loadVocAiConfig(env = process.env) {
  const apiKey = String(env.GEMINI_API_KEY ?? '').trim();
  const model = String(env.VOC_AI_MODEL ?? '').trim();
  const useGemini =
    env.VOC_USE_GEMINI === '1' || env.VOC_USE_GEMINI === 'true' || env.VOC_USE_GEMINI === true;
  const hasApiKey = Boolean(apiKey);
  const hasModel = Boolean(model);
  return {
    provider: env.VOC_AI_PROVIDER ?? 'gemini',
    model,
    apiKey,
    hasApiKey,
    hasModel,
    useGemini,
    /** Chave + modelo configurados (validação na API é etapa separada). */
    geminiConfigured: hasApiKey && hasModel,
    /** Alias legado — materialização / refresh. */
    useGeminiPrimary: useGemini,
    /** VoC IA ligado (flag explícita). */
    geminiActivated: hasApiKey && hasModel && useGemini,
    concurrency: Math.max(1, Math.min(10, Number(env.VOC_AI_CONCURRENCY ?? 4))),
    retries: Math.max(0, Math.min(6, Number(env.VOC_AI_RETRIES ?? 3))),
    timeoutMs: Math.max(5000, Number(env.VOC_AI_TIMEOUT_MS ?? 28_000)),
    classifierVersion: VOC_GEMINI_CLASSIFIER_VERSION,
    promptVersion: VOC_GEMINI_PROMPT_VERSION,
  };
}

/** Log seguro de config (nunca imprime a chave). */
export function printGeminiEnvSummary(config) {
  console.log(
    JSON.stringify(
      {
        provider: config.provider,
        model: config.model || null,
        useGemini: config.useGemini,
        hasGeminiKey: config.hasApiKey,
        keyLength: config.hasApiKey ? config.apiKey.length : 0,
        concurrency: config.concurrency,
        retries: config.retries,
        timeoutMs: config.timeoutMs,
      },
      null,
      2,
    ),
  );
}

export function createEmptyGeminiRunStats() {
  return {
    attempted_gemini: 0,
    successful_gemini: 0,
    fallback: 0,
    failed: 0,
    invalid_json: 0,
    rate_limit: 0,
    timeout: 0,
    cache_hits: 0,
    gemini_calls: 0,
    fallback_reasons: {},
    no_additional_comment: 0,
  };
}

export function bumpFallbackReason(stats, reason) {
  if (!stats?.fallback_reasons) return;
  const r = reason ?? 'unknown';
  stats.fallback_reasons[r] = (stats.fallback_reasons[r] ?? 0) + 1;
}
