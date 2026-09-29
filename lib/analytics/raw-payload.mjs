/**
 * Módulo preparado para extração futura de drivers a partir do Typeform.
 * Etapa 2: não parseia todas as perguntas.
 */

/**
 * @param {object|null|undefined} rawPayload nps_responses.raw_payload
 * @returns {object|null}
 */
export function getFormResponse(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  return rawPayload.form_response ?? null;
}

/**
 * @param {object|null|undefined} rawPayload
 * @returns {Array<object>}
 */
export function listAnswers(rawPayload) {
  const fr = getFormResponse(rawPayload);
  if (!fr || !Array.isArray(fr.answers)) return [];
  return fr.answers;
}

/**
 * Placeholder para pipeline de drivers (escala, múltipla escolha, texto).
 * @returns {Promise<Array<object>>}
 */
export async function extractDriversFromPayload(_rawPayload) {
  return [];
}
