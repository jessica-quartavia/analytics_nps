import { OFFICIAL_TOPICS } from './voc-config.mjs';

const VALENCES = new Set(['Positiva', 'Neutra', 'Negativa']);
const REASONS = new Set([
  'explicit_positive',
  'explicit_negative',
  'prospective_neutral',
  'mixed_clause',
  'question_positive_context',
  'negation_negative',
  'never_thought_positive',
  'weak_signal',
  'default_neutral',
  'conditional_demand',
]);

/**
 * @param {unknown} raw
 * @param {Set<string>} allowedThemes — union of candidate themes in request
 */
export function validateGeminiClassificationResponse(raw, allowedThemes) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'resposta não é objeto' };
  }
  /** @type {Array<object>} */
  const out = [];
  const list = Array.isArray(raw.classifications) ? raw.classifications : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'item inválido' };
    const theme = item.theme ?? item.topic;
    if (!OFFICIAL_TOPICS.includes(theme) || !allowedThemes.has(theme)) {
      return { ok: false, error: `tema inválido: ${theme}` };
    }
    const valence = item.valence;
    if (!VALENCES.has(valence)) return { ok: false, error: `valência inválida: ${valence}` };
    let confidence = Number(item.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return { ok: false, error: 'confidence fora de 0–1' };
    }
    confidence = Math.round(confidence * 1000) / 1000;
    const evidence = String(item.evidence ?? '').trim().slice(0, 280);
    if (!evidence) return { ok: false, error: 'evidence ausente' };
    let reason = item.reason ?? 'default_neutral';
    if (!REASONS.has(reason)) reason = 'default_neutral';
    out.push({ theme, valence, confidence, evidence, reason });
  }
  const noAdditional =
    raw.no_additional_comment === true || (list.length === 0 && raw.no_additional_comment !== false);
  return { ok: true, classifications: out, no_additional_comment: Boolean(raw.no_additional_comment) };
}
