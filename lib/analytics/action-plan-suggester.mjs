import { loadActionAiConfig } from './action-ai-config.mjs';
import {
  geminiApiFetch,
  sanitizeGeminiErrorMessage,
  generateContentPath,
} from './voc-gemini-http.mjs';
import {
  parseGeminiApiHttpBody,
  extractCandidateTextFromApiData,
  parseClassifierJsonFromModelText,
} from './voc-gemini-response.mjs';

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    objective: { type: 'string' },
    action_text: { type: 'string' },
    responsible_area: { type: 'string' },
    recommended_due_days: { type: 'integer' },
    success_criteria: { type: 'string' },
    main_problem: { type: 'string' },
  },
  required: ['objective', 'action_text', 'responsible_area', 'recommended_due_days', 'success_criteria'],
};

function buildPlanPrompt(row) {
  const topics = (row.topics ?? [])
    .map((t) => `${t.topic} (${t.valence}, conf=${t.confidence ?? '—'})`)
    .join('; ');
  return JSON.stringify(
    {
      client_name: row.client_name,
      ep_name: row.ep_name,
      nps_current: row.current_score,
      nps_previous: row.previous_score,
      delta: row.score_delta,
      category: row.current_category,
      migration: row.nps_migration,
      voc_comment: row.comment,
      voc_topics: topics,
      main_problem: row.ai_main_problem ?? row.ai_theme,
      priority: row.final_priority ?? row.display_priority,
      urgency: row.ai_urgency,
      suggested_owner_area: row.ai_suggested_owner_area,
    },
    null,
    2,
  );
}

/**
 * @param {object} row — linha da fila enriquecida
 */
export async function suggestActionPlanWithGemini(row, env = process.env) {
  const config = loadActionAiConfig(env);
  if (!config.geminiActivated) {
    return {
      ok: false,
      code: 'GEMINI_DISABLED',
      error: 'Gemini desativado ou sem chave. Ative ACTION_USE_GEMINI e GEMINI_API_KEY.',
    };
  }

  const system = `Você é analista de Customer Success da QuartaVia. Sugira um plano de ação NPS conciso, executável e mensurável. Responda apenas JSON.`;
  const userText = `Contexto do cliente:\n${buildPlanPrompt(row)}`;
  const path = generateContentPath(config.model);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: PLAN_SCHEMA,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const { res } = await geminiApiFetch(
      config.apiKey,
      path,
      { method: 'POST', body: JSON.stringify(body), signal: controller.signal },
      {},
    );
    clearTimeout(timer);
    const rawText = await res.text();
    if (!res.ok) {
      const msg = sanitizeGeminiErrorMessage(rawText);
      const code = res.status === 429 ? 'GEMINI_RATE_LIMIT' : 'GEMINI_HTTP';
      return {
        ok: false,
        code,
        error:
          res.status === 429
            ? 'IA temporariamente indisponível. Você ainda pode criar o plano manualmente.'
            : msg,
      };
    }
    const httpParsed = parseGeminiApiHttpBody(rawText);
    if (!httpParsed.ok) return { ok: false, code: 'GEMINI_INVALID_OUTPUT' };
    const text = extractCandidateTextFromApiData(httpParsed.data);
    const parsed = parseClassifierJsonFromModelText(text);
    if (!parsed.ok) return { ok: false, code: 'GEMINI_INVALID_JSON' };

    const d = parsed.data;
    const due = new Date();
    due.setDate(due.getDate() + Math.max(1, Number(d.recommended_due_days) || 7));

    return {
      ok: true,
      model: config.model,
      suggestion: {
        objective: d.objective,
        main_problem: d.main_problem ?? row.ai_main_problem ?? '',
        action_text: d.action_text,
        responsible: d.responsible_area,
        due_date: due.toISOString().slice(0, 10),
        success_criteria: d.success_criteria,
        plan_origin: 'ai_suggested',
      },
    };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = e.name === 'AbortError';
    return {
      ok: false,
      code: isAbort ? 'GEMINI_TIMEOUT' : 'GEMINI_ERROR',
      error: isAbort
        ? 'IA temporariamente indisponível. Você ainda pode criar o plano manualmente.'
        : (e.message ?? 'Erro Gemini'),
    };
  }
}
