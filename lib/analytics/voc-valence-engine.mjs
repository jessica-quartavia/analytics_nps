import {
  POSITIVE_CUES,
  NEGATIVE_CUES,
  POSITIVE_PHRASES,
  NEGATIVE_PHRASES,
} from './voc-config.mjs';

/** @typedef {'Positiva' | 'Neutra' | 'Negativa'} TopicValence */
/** @typedef {'explicit_positive' | 'explicit_negative' | 'prospective_neutral' | 'negation_negative' | 'question_positive_context' | 'mixed_clause' | 'never_thought_positive' | 'weak_signal' | 'default_neutral'} ValenceReason */

export const NEVER_THOUGHT_POSITIVE_RE =
  /nunca tinha pensado|nunca tinha participado|nunca pensei|nunca imaginei|nunca tinha considerado/;

export const PROSPECTIVE_LEAD_RE =
  /^(?:ter|continuar|manter|seguir|persistir|permanecer)\b/;

/**
 * @param {string} window
 * @returns {string[]}
 */
export function matchedPositiveCues(window) {
  /** @type {string[]} */
  const hits = [];
  for (const cue of POSITIVE_CUES) {
    if (window.includes(cue)) hits.push(cue);
  }
  for (const p of POSITIVE_PHRASES) {
    if (window.includes(p)) hits.push(`phrase:${p}`);
  }
  return hits;
}

/**
 * @param {string} window
 * @returns {string[]}
 */
export function matchedNegativeCues(window) {
  /** @type {string[]} */
  const hits = [];
  for (const p of NEGATIVE_PHRASES) {
    if (window.includes(p)) hits.push(`phrase:${p}`);
  }
  if (/\b(nao|não)\s+(tive|vi|recebi|entreg|acontece|cheg|obtive|consegui|tenho)\b/.test(window)) {
    hits.push('negation:nao+verbo');
  }
  for (const cue of NEGATIVE_CUES) {
    if (!window.includes(cue)) continue;
    if (cue === 'nunca') {
      if (NEVER_THOUGHT_POSITIVE_RE.test(window)) continue;
      if (/nunca recomendo|nunca mais|nunca respond|nunca atend/.test(window)) {
        hits.push(cue);
      }
      continue;
    }
    hits.push(cue);
  }
  return hits;
}

export function hasStrongPositivePhrase(window) {
  for (const p of POSITIVE_PHRASES) {
    if (window.includes(p)) return true;
  }
  if (NEVER_THOUGHT_POSITIVE_RE.test(window) && /clareza|claro|clara|confian|patrimon|implement/.test(window)) {
    return true;
  }
  return false;
}

export function hasExplicitNegativePhrase(window) {
  for (const p of NEGATIVE_PHRASES) {
    if (window.includes(p)) return true;
  }
  if (/\b(nao|não)\s+(tive|vi|recebi|entreg|acontece|cheg|obtive|consegui|tenho)\b/.test(window)) {
    return true;
  }
  if (/\b(ainda nao vi|ainda não vi|ainda nao tive|ainda não tive|nao tenho clareza|não tenho clareza)\b/.test(window)) {
    return true;
  }
  return false;
}

/**
 * @param {string} window
 * @param {string} hint
 */
export function isProspectiveAspiration(window, hint) {
  if (hint === 'continuation') return true;
  const w = window.trim();
  if (PROSPECTIVE_LEAD_RE.test(w)) return true;
  if (/retornos consistentes|retorno consistente|boas oportunidades|bons investimentos|continuar tendo|manter o atendimento|seguir com clareza/.test(w)) {
    return true;
  }
  return false;
}

/**
 * @param {string} window
 * @param {{ hint?: string, npsScore?: number | null }} [ctx]
 * @returns {{ valence: TopicValence, reason: ValenceReason, matchedPositive: string[], matchedNegative: string[], confidence: number }}
 */
export function resolveValenceInWindow(window, ctx = {}) {
  const hint = ctx.hint ?? 'general';
  const matchedPositive = matchedPositiveCues(window);
  const matchedNegative = matchedNegativeCues(window);
  let pos = matchedPositive.length;
  let neg = matchedNegative.length;

  if (hasStrongPositivePhrase(window)) pos += 2;
  if (hasExplicitNegativePhrase(window)) neg += 3;

  if (NEVER_THOUGHT_POSITIVE_RE.test(window) && /clareza|claro|clara/.test(window)) {
    return {
      valence: 'Positiva',
      reason: 'never_thought_positive',
      matchedPositive,
      matchedNegative,
      confidence: 0.88,
    };
  }

  if (isProspectiveAspiration(window, hint) && !hasExplicitNegativePhrase(window)) {
    const valence = pos > 0 ? 'Positiva' : 'Neutra';
    return {
      valence,
      reason: 'prospective_neutral',
      matchedPositive,
      matchedNegative,
      confidence: pos > 0 ? 0.78 : 0.72,
    };
  }

  if (hint === 'praise') pos += 1;
  if (hint === 'improvement') neg += 1;
  if (hint === 'conditional') neg += 1;

  if (neg > 0 && pos > 0) {
    if (neg >= pos + 2) {
      return {
        valence: 'Negativa',
        reason: 'mixed_clause',
        matchedPositive,
        matchedNegative,
        confidence: 0.82,
      };
    }
    if (pos >= neg + 2) {
      return {
        valence: 'Positiva',
        reason: 'mixed_clause',
        matchedPositive,
        matchedNegative,
        confidence: 0.82,
      };
    }
    return {
      valence: 'Neutra',
      reason: 'mixed_clause',
      matchedPositive,
      matchedNegative,
      confidence: 0.58,
    };
  }
  if (neg > pos) {
    return {
      valence: 'Negativa',
      reason: hasExplicitNegativePhrase(window) ? 'explicit_negative' : 'weak_signal',
      matchedPositive,
      matchedNegative,
      confidence: hasExplicitNegativePhrase(window) ? 0.86 : 0.62,
    };
  }
  if (pos > neg) {
    return {
      valence: 'Positiva',
      reason: hasStrongPositivePhrase(window) ? 'explicit_positive' : 'weak_signal',
      matchedPositive,
      matchedNegative,
      confidence: hasStrongPositivePhrase(window) ? 0.88 : 0.7,
    };
  }

  if (hint === 'praise' && !hasExplicitNegativePhrase(window)) {
    return {
      valence: 'Positiva',
      reason: 'question_positive_context',
      matchedPositive,
      matchedNegative,
      confidence: 0.84,
    };
  }
  if ((hint === 'improvement' || hint === 'conditional') && hasExplicitNegativePhrase(window)) {
    return {
      valence: 'Negativa',
      reason: 'explicit_negative',
      matchedPositive,
      matchedNegative,
      confidence: 0.85,
    };
  }
  if (hint === 'conditional' && (window.includes('garantia') || window.includes('prometidos'))) {
    return {
      valence: 'Negativa',
      reason: 'explicit_negative',
      matchedPositive,
      matchedNegative,
      confidence: 0.8,
    };
  }

  const score = ctx.npsScore;
  if (pos === 0 && neg === 0 && hint === 'improvement' && score != null && score <= 6) {
    return {
      valence: 'Negativa',
      reason: 'question_positive_context',
      matchedPositive,
      matchedNegative,
      confidence: 0.65,
    };
  }

  return {
    valence: 'Neutra',
    reason: 'default_neutral',
    matchedPositive,
    matchedNegative,
    confidence: 0.52,
  };
}

export function valenceConfidenceFromResolution(resolved, window, hint) {
  let c = resolved.confidence;
  if (resolved.reason === 'weak_signal' && resolved.valence === 'Negativa') {
    c = Math.min(c, 0.62);
  }
  if (hint === 'praise' && resolved.valence === 'Positiva') c = Math.max(c, 0.84);
  if (resolved.valence === 'Neutra') c = Math.min(c, 0.72);
  return Math.min(0.95, Math.max(0.45, c));
}
