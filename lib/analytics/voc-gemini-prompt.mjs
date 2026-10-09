import { OFFICIAL_TOPICS } from './voc-config.mjs';
import { VOC_GEMINI_PROMPT_VERSION } from './voc-ai-config.mjs';

export function buildGeminiSystemInstruction() {
  return `Você é um classificador de Voice of Customer (VoC) em português do Brasil.

Interprete SEMPRE pergunta + resposta juntos. A valência vem do sentido do trecho em relação ao tema — NÃO da presença do nome do tema, NÃO da nota NPS isolada, NÃO de palavra isolada fora de contexto.

Tema ≠ valência. Ex.: "Eu esperava muito mais." → tema Expectativa, valência NEGATIVA.

Para cada tema candidato, decida se a menção na RESPOSTA daquele segmento é:
- Positiva: elogio, satisfação ou benefício explícito ligado ao tema
- Neutra: menção descritiva sem carga clara de satisfação ou insatisfação
- Negativa: crítica, frustração, promessa não cumprida, ausência de entrega, insatisfação

=== EXPECTATIVA (Negativa) ===
Classifique Expectativa como NEGATIVA quando houver: expectativa frustrada; promessa não cumprida; "esperava mais"; "precisa entregar"; "deveria melhorar"; cobrança; condição para continuar porque o presente é ruim; desejo de mudança por insatisfação atual.
Exemplos: "Precisa entregar o que prometeu." → Expectativa / Negativa. "Esperava muito mais do projeto." → Negativa. "Que possa mudar o quadro." (pergunta de continuidade/melhoria) → Expectativa / Negativa.

=== EXPECTATIVA (Positiva) ===
Só Positiva com satisfação real: "Superou minhas expectativas.", "Vejo boas perspectivas com o plano.", "Estou confiante com o que vem pela frente." Desejo futuro ou condição NÃO é positivo automaticamente.

=== VALOR PERCEBIDO (Negativa) ===
Negativa quando: não agregou valor; não compensou; retorno insuficiente; custo não se justifica; entrega inferior ao investimento; pedido de devolução/reembolso do valor contratado.
Ex.: "Até agora não agregou em nada." → Valor percebido / Negativa. "Preciso de devolução do valor contratado." → Valor percebido / Negativa.

=== VALOR PERCEBIDO (Positiva) ===
Só com benefício explícito: "Valeu o investimento.", "Já percebo bastante valor.", "Retorno acima do esperado."

=== PERGUNTAS DE MELHORIA / CONTINUIDADE ===
Se a pergunta pede o que melhorar ou o que faria continuar, respostas como "Entregar o prometido", "Ter retorno", "Melhorar resultados", "Mais transparência" são reclamação/condição — valência NEGATIVA no tema relacionado, não Positiva.

=== NEGAÇÃO E TOM ===
Peso forte: não, nunca, nada, sem, faltou, não agregou, não entregou, não tive, não vejo, não recomendo, não compensou, péssimo, fraco, decepcionante, insatisfeito, sem resultado.

=== EVIDENCE ===
Campo evidence: trecho literal curto da RESPOSTA. A valência deve ser justificável por esse trecho. Nunca Positiva com evidence claramente negativa (ex.: evidence "não agregou em nada" → valência não pode ser Positiva).

=== NOTA NPS (CONTEXTO AUXILIAR — NÃO SUBSTITUI O TEXTO) ===
A nota indica tendência emocional geral esperada:
- 0–6: tendência negativa (detrator) — desconfie de temas Positivos, salvo elogio explícito no trecho
- 7–8: tendência neutra
- 9–10: tendência positiva (promotor) — desconfie de temas Negativos, salvo crítica explícita no trecho
A valência de cada tema vem SEMPRE do texto da resposta; a nota só ajuda a calibrar dúvidas.
Não confundir “mencionar um tema” com “avaliar o tema positivamente”.
Frases como “não entregou”, “não agregou”, “péssima experiência”, “sem resultado”, “desorganizado”, “não indico” tendem a Negativa nos temas relacionados.

REGRAS GERAIS:
- Nota NPS é só contexto auxiliar de tendência.
- Em frases mistas, classifique cada tema pelo trecho relevante.
- "Nunca tinha pensado..." com benefício patrimonial pode ser Positiva no tema certo — não inverta por "nunca" sozinho.
- Resposta "não"/"nada" a comentário adicional opcional → sem temas.
- Use SOMENTE temas candidatos; omita tema sem evidência.

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
        expected_sentiment_bias:
          payload.score == null || Number.isNaN(Number(payload.score))
            ? 'unknown'
            : Number(payload.score) <= 6
              ? 'negative'
              : Number(payload.score) <= 8
                ? 'neutral'
                : 'positive',
      },
      segments: payload.segments,
      output_schema: {
        classifications: [
          {
            theme: 'string (um dos temas candidatos do segmento)',
            valence: 'Positiva | Neutra | Negativa',
            confidence: 'number 0-1',
            evidence: 'trecho literal curto da resposta',
            reason: 'explicit_positive | explicit_negative | prospective_neutral | mixed_clause | question_positive_context | negation_negative | conditional_demand | default_neutral',
          },
        ],
        no_additional_comment: 'boolean',
      },
    },
    null,
    2,
  );
}
