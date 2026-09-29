import { OFFICIAL_TOPICS, TOPIC_KEYWORD_RULES, VOC_CLASSIFIER_VERSION } from './voc-config.mjs';
import { resolveValenceInWindow, valenceConfidenceFromResolution } from './voc-valence-engine.mjs';

export { VOC_CLASSIFIER_VERSION };

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * @param {string} questionNorm
 * @returns {'praise' | 'continuation' | 'improvement' | 'conditional' | 'general'}
 */
export function inferQuestionHint(questionNorm) {
  const q = questionNorm ?? '';
  if (/nota 9 ou 10|o que mais te agradou|principal razao|principal motivo|motivo da sua nota/.test(q)) {
    return 'praise';
  }
  if (/melhorar|precisa melhorar|o que mudar|o que precisa/.test(q)) return 'improvement';
  if (
    /continuar.*5 anos|continuar com a gente|o que te faria continuar|o que faria voce permanecer|permanecer conosco|sem hesitar/.test(
      q,
    )
  ) {
    return 'continuation';
  }
  if (/houvesse|garantia|prometidos|o que espera daqui|daqui para frente/.test(q)) return 'conditional';
  return 'general';
}

/**
 * @param {string} comment
 * @returns {{ normalized: string, segments: Array<{ question: string, answer: string, answerStartNorm: number, answerNormalized: string, hint: string }> }}
 */
export function parseCommentSegments(comment) {
  const raw = String(comment ?? '').trim();
  const normalized = normalizeText(raw);
  /** @type {Array<object>} */
  const segments = [];
  if (!raw) return { normalized, segments };

  const blocks = raw.split(/\n\s*\n/);
  let searchFrom = 0;
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const blockStart = raw.indexOf(trimmed, searchFrom);
    searchFrom = blockStart + trimmed.length;

    let question = '';
    let answer = trimmed;
    const qMark = trimmed.match(/^(.+\?)\s*:?\s*(.+)$/s);
    if (qMark) {
      question = qMark[1].trim();
      answer = qMark[2].trim();
    } else {
      const colon = trimmed.indexOf(':');
      if (colon > 0 && colon < 140) {
        question = trimmed.slice(0, colon).trim();
        answer = trimmed.slice(colon + 1).trim();
      }
    }

    const answerOffsetInBlock = trimmed.indexOf(answer);
    const answerStartRaw = blockStart + (answerOffsetInBlock >= 0 ? answerOffsetInBlock : 0);
    const answerStartNorm = normalizeText(raw.slice(0, answerStartRaw)).length;

    segments.push({
      question,
      answer,
      answerStartNorm,
      answerNormalized: normalizeText(answer),
      hint: inferQuestionHint(normalizeText(question)),
    });
  }

  return { normalized, segments };
}

function clauseWindow(normalizedFull, matchIndex) {
  const breaks = [0];
  const re = /[,;]|(?:\s+mas\s+)|\.+(?:\s+|$)|\n+|\s+"|"\s+/g;
  let m;
  while ((m = re.exec(normalizedFull))) {
    breaks.push(m.index + m[0].length);
  }
  breaks.push(normalizedFull.length);
  for (let i = 0; i < breaks.length - 1; i++) {
    if (matchIndex >= breaks[i] && matchIndex < breaks[i + 1]) {
      return normalizedFull.slice(breaks[i], breaks[i + 1]);
    }
  }
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(normalizedFull.length, matchIndex + 60);
  return normalizedFull.slice(start, end);
}

function segmentForMatch(segments, matchIndex) {
  for (const s of segments) {
    const end = s.answerStartNorm + s.answerNormalized.length;
    if (matchIndex >= s.answerStartNorm && matchIndex < end) return s;
  }
  return segments[0] ?? null;
}

/**
 * @param {string} normalizedFull
 * @param {number} matchIndex
 * @param {{ segments?: Array<object>, npsScore?: number | null }} [ctx]
 */
export function inferLocalValence(normalizedFull, matchIndex, ctx = {}) {
  const segments = ctx.segments ?? [];
  const seg = segmentForMatch(segments, matchIndex);
  const window = clauseWindow(normalizedFull, matchIndex);
  return resolveValenceInWindow(window, {
    hint: seg?.hint ?? 'general',
    npsScore: ctx.npsScore ?? null,
  }).valence;
}

/** @deprecated use resolveValenceInWindow from voc-valence-engine */
export function resolveValenceInWindowLegacy(window, ctx = {}) {
  return resolveValenceInWindow(window, ctx).valence;
}

/**
 * @param {string} comment
 * @param {{ npsScore?: number | null }} [opts]
 */
export function classifyCommentWithRules(comment, opts = {}) {
  const raw = String(comment ?? '').trim();
  if (!raw) return [];

  const { normalized, segments } = parseCommentSegments(raw);
  const ctx = { segments, npsScore: opts.npsScore ?? null };
  const found = [];

  for (const topic of OFFICIAL_TOPICS) {
    const keywords = TOPIC_KEYWORD_RULES[topic] ?? [];
    let best = null;
    for (const kw of keywords) {
      const needle = normalizeText(kw);
      const idx = normalized.indexOf(needle);
      if (idx === -1) continue;
      const window = clauseWindow(normalized, idx);
      const seg = segmentForMatch(segments, idx);
      const hint = seg?.hint ?? 'general';
      const resolved = resolveValenceInWindow(window, { hint, npsScore: ctx.npsScore });
      const confidence = Math.min(
        0.95,
        valenceConfidenceFromResolution(resolved, window, hint) * 0.5 + 0.45 + needle.length * 0.02,
      );
      if (!best || confidence > best.confidence) {
        best = {
          topic,
          valence: resolved.valence,
          confidence,
          matchIndex: idx,
          valence_reason: resolved.reason,
          matched_positive_cues: resolved.matchedPositive,
          matched_negative_cues: resolved.matchedNegative,
        };
      }
    }
    if (best) found.push(best);
  }

  return found;
}

export function classifyFromExternal(responseId, externalByResponseId) {
  const rows = externalByResponseId.get(responseId);
  if (!rows?.length) return [];
  return rows.map((r) => ({
    topic: r.topic,
    valence: r.valence,
    confidence: r.confidence ?? 0.95,
    classification_source: 'external_import',
    reviewed: Boolean(r.reviewed),
  }));
}

export function buildResponseTopicsRows(responses, opts = {}) {
  const { externalImport = [], useRules = true } = opts;
  const externalByResponseId = new Map();
  for (const block of externalImport) {
    if (block?.response_id && Array.isArray(block.topics)) {
      externalByResponseId.set(block.response_id, block.topics);
    }
  }

  /** @type {Array<object>} */
  const out = [];

  for (const r of responses ?? []) {
    const comment = r.comment?.trim();
    if (!comment) continue;

    const external = classifyFromExternal(r.response_id, externalByResponseId);
    if (external.length) {
      for (const row of external) {
        out.push({
          response_id: r.response_id,
          client_id: r.client_id ?? null,
          analytical_cycle_code: r.analytical_cycle_code,
          topic: row.topic,
          valence: row.valence,
          confidence: row.confidence,
          classification_source: row.classification_source,
          reviewed: row.reviewed,
        });
      }
      continue;
    }

    if (!useRules) continue;

    const mentions = classifyCommentWithRules(comment, { npsScore: r.score ?? null });
    for (const m of mentions) {
      out.push({
        response_id: r.response_id,
        client_id: r.client_id ?? null,
        analytical_cycle_code: r.analytical_cycle_code,
        topic: m.topic,
        valence: m.valence,
        confidence: Math.round(m.confidence * 1000) / 1000,
        classification_source: VOC_CLASSIFIER_VERSION,
        valence_reason: m.valence_reason ?? null,
        reviewed: false,
      });
    }
  }

  return out;
}

export function hasCommentText(comment) {
  return Boolean(String(comment ?? '').trim());
}
