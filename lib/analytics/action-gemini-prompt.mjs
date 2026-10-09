import { OFFICIAL_TOPICS } from './voc-config.mjs';
import { ACTION_GEMINI_PROMPT_VERSION } from './action-ai-config.mjs';

export const ACTION_PRIORITIES = ['Crítica', 'Alta', 'Média', 'Baixa', 'Acompanhamento positivo'];
export const ACTION_URGENCIES = ['Imediata', 'Alta', 'Média', 'Baixa'];
export const ACTION_CATEGORIES = [
  'Contato imediato',
  'Acompanhar',
  'Investigar',
  'Aprendizado',
  'Sem ação imediata',
];
export const OWNER_AREAS = [
  'Engenheiro Patrimonial',
  'Relacionamento / CS',
  'Operações',
  'Produto / Tecnologia',
  'Liderança',
  'Não informado',
];

export function buildActionGeminiSystemInstruction() {
  return `Você classifica itens da fila de Plano de Ação NPS (português BR).

Para cada item, sugira com base no contexto fornecido (notas, migração NPS, comentário, temas VoC, motivo analítico):
- theme: um tema principal da lista oficial
- priority: Crítica | Alta | Média | Baixa (use o contexto real — risco de churn, detrator recorrente, queda forte → mais alta)
- urgency: Imediata | Alta | Média | Baixa
- action_category: tipo de ação recomendada
- suggested_owner_area: área responsável sugerida
- confidence: 0 a 1
- reason: frase curta justificando
- evidence: trecho literal curto do comentário ou sinal factual

Temas oficiais: ${OFFICIAL_TOPICS.join('; ')}

Prioridades analíticas de referência (não copiar cegamente): Alta/Média/Investigar/Aprendizado da fila rules-based podem informar, mas você deve recomendar Crítica/Alta/Média/Baixa conforme gravidade.

Retorne EXCLUSIVAMENTE JSON válido no schema, sem markdown.
Prompt version: ${ACTION_GEMINI_PROMPT_VERSION}`;
}

/**
 * @param {object} item
 */
export function buildActionGeminiUserPayload(item) {
  const topics = (item.topics ?? [])
    .map((t) => `${t.topic ?? t.theme} (${t.valence ?? '—'})`)
    .join('; ');
  return JSON.stringify(
    {
      client_name: item.client_name ?? null,
      cycle_code: item.cycle_code ?? null,
      previous_score: item.previous_score ?? null,
      current_score: item.current_score ?? null,
      score_delta: item.score_delta ?? null,
      nps_migration: item.nps_migration ?? null,
      rules_priority: item.priority ?? item.rules_priority ?? null,
      reason: item.reason ?? null,
      comment: item.comment ?? null,
      topics_voc: topics || null,
      primary_topic: item.primary_topic ?? null,
      critical_flag: item.critical_flag ?? false,
    },
    null,
    2,
  );
}
