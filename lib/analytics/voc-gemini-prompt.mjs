import { OFFICIAL_TOPICS } from './voc-config.mjs';
import { VOC_GEMINI_PROMPT_VERSION } from './voc-ai-config.mjs';

export function buildGeminiSystemInstruction() {
  return `Você é um classificador de Voice of Customer (VoC) em português do Brasil.

Analise somente o significado do texto fornecido em cada segmento pergunta/resposta.

Para cada tema candidato listado, decida se a menção na RESPOSTA daquele segmento é:
- Positiva: elogio, satisfação ou benefício ligado ao tema
- Neutra: menção ou expectativa futura sem insatisfação atual explícita
- Negativa: crítica, frustração, problema, ausência de entrega ou insatisfação ligada ao tema

REGRAS:
- A nota NPS é apenas contexto auxiliar; NÃO use a nota para definir valência automaticamente.
- Um Promotor pode criticar um tema; um Detrator pode elogiar outro.
- Distinja expectativa futura ("ter retornos consistentes") de reclamação ("ainda não tive retorno").
- Em frases mistas, classifique cada tema pelo trecho relevante (ex.: atendimento excelente + resultado ruim).
- "Nunca tinha pensado..." com clareza/patrimônio positivo NÃO é negativo por causa de "nunca".
- Resposta "não"/"nada" a pergunta de comentário adicional NÃO gera temas nem valência negativa.
- Use SOMENTE os temas candidatos fornecidos; não invente temas.
- Se não houver evidência para um tema candidato, omita-o do array classifications.

Retorne EXCLUSIVAMENTE JSON válido no schema solicitado, sem markdown.`;
}

/**
 * @param {object} payload
 * @param {number|null} payload.score
 * @param {string|null} payload.nps_category
 * @param {Array<{ question: string, answer: string, candidate_themes: string[] }>} payload.segments
 */
export function buildGeminiUserPayload(payload) {
  return JSON.stringify(
    {
      prompt_version: VOC_GEMINI_PROMPT_VERSION,
      allowed_themes: OFFICIAL_TOPICS,
      allowed_valences: ['Positiva', 'Neutra', 'Negativa'],
      response_context: {
        score: payload.score ?? null,
        nps_category: payload.nps_category ?? null,
      },
      segments: payload.segments,
      output_schema: {
        classifications: [
          {
            theme: 'string (um dos temas candidatos do segmento)',
            valence: 'Positiva | Neutra | Negativa',
            confidence: 'number 0-1',
            evidence: 'trecho curto da resposta',
            reason: 'explicit_positive | explicit_negative | prospective_neutral | mixed_clause | question_positive_context | default_neutral',
          },
        ],
        no_additional_comment: 'boolean — true se todos os segmentos forem ausência de comentário adicional',
      },
    },
    null,
    2,
  );
}
