import {
  loadActionAiConfig,
  ACTION_GEMINI_CLASSIFIER_VERSION,
  isActionGeminiRequired,
} from './action-ai-config.mjs';
import { createActionGeminiClient } from './action-gemini-client.mjs';
import { OFFICIAL_TOPICS } from './voc-config.mjs';
import { createHash } from 'node:crypto';

function buildInputHash(item, config) {
  const payload = {
    source_id: item.source_id ?? item.response_id,
    comment: item.comment ?? '',
    reason: item.reason ?? '',
    scores: [item.previous_score, item.current_score],
    prompt_version: config.promptVersion,
    model: config.model,
    classifier_version: config.classifierVersion,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function rulesFallback(item, reason) {
  const theme =
    OFFICIAL_TOPICS.find((t) => (item.primary_topic ?? '').startsWith(t)) ??
    (item.topics?.[0]?.topic ?? 'Atendimento / relacionamento');
  const rulesPri = item.priority ?? item.rules_priority ?? 'Média';
  const priorityMap = { Alta: 'Alta', Média: 'Média', Investigar: 'Alta', Aprendizado: 'Baixa' };
  return {
    ok: true,
    classifier_source: 'rules_fallback',
    classifier_version: ACTION_GEMINI_CLASSIFIER_VERSION,
    provider: 'rules',
    model: null,
    fallback_reason: reason,
    classification: {
      theme,
      priority: priorityMap[rulesPri] ?? 'Média',
      urgency: rulesPri === 'Alta' ? 'Alta' : 'Média',
      action_category:
        rulesPri === 'Alta'
          ? 'Contato imediato'
          : rulesPri === 'Investigar'
            ? 'Investigar'
            : rulesPri === 'Aprendizado'
              ? 'Aprendizado'
              : 'Acompanhar',
      suggested_owner_area: 'Engenheiro Patrimonial',
      confidence: 0.55,
      reason: item.reason ?? 'Classificação heurística baseada na prioridade analítica existente.',
      evidence: (item.comment ?? '').slice(0, 200) || null,
    },
  };
}

/**
 * @param {object} input — item da fila (response_id como source_id)
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function classifyActionUnit(input, env = process.env) {
  const config = loadActionAiConfig(env);
  const requireGemini = isActionGeminiRequired(env);
  const sourceId = input.source_id ?? input.response_id;
  if (!sourceId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'source_id ou response_id é obrigatório' };
  }

  const inputHash = buildInputHash({ ...input, source_id: sourceId }, config);

  if (!config.geminiConfigured || !config.useGemini) {
    const reason = !config.hasApiKey ? 'missing_key' : 'gemini_disabled';
    if (requireGemini) {
      return {
        ok: false,
        code: 'GEMINI_REQUIRED',
        error: `Gemini obrigatório (ACTION_REQUIRE_GEMINI) mas indisponível: ${reason}`,
        input_hash: inputHash,
      };
    }
    const fb = rulesFallback(input, reason);
    return { ...fb, input_hash: inputHash, prompt_version: config.promptVersion, model: config.model };
  }

  const client = createActionGeminiClient(config);
  const api = await client.classifyActionItem(input);
  if (!api.ok) {
    if (requireGemini) {
      return {
        ok: false,
        code: 'GEMINI_FAILED',
        error: api.errorCode ?? api.fallback_reason ?? 'Gemini falhou',
        fallback_reason: api.fallback_reason,
        errorCode: api.errorCode,
        input_hash: inputHash,
      };
    }
    const fb = rulesFallback(input, api.fallback_reason ?? api.errorCode);
    return { ...fb, input_hash: inputHash, prompt_version: config.promptVersion, model: config.model };
  }

  const c = api.data;
  const needsHumanReview = c.confidence < 0.65;
  return {
    ok: true,
    classifier_source: 'gemini',
    classifier_version: ACTION_GEMINI_CLASSIFIER_VERSION,
    provider: config.provider,
    model: config.model,
    prompt_version: config.promptVersion,
    input_hash: inputHash,
    needs_human_review: needsHumanReview,
    classification: {
      theme: c.theme,
      priority: c.priority,
      urgency: c.urgency,
      action_category: c.action_category,
      suggested_owner_area: c.suggested_owner_area,
      confidence: c.confidence,
      reason: c.reason,
      evidence: c.evidence,
      main_problem: c.main_problem,
      recommended_action: c.recommended_action,
    },
  };
}
