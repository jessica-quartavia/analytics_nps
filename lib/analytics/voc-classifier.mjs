import {
  OFFICIAL_TOPICS,
  TOPIC_KEYWORD_RULES,
  POSITIVE_CUES,
  NEGATIVE_CUES,
} from './voc-config.mjs';

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Valência local (~80 chars) — não colapsa o comentário inteiro.
 * @param {string} normalizedFull
 * @param {number} matchIndex
 * @returns {'Positiva' | 'Neutra' | 'Negativa'}
 */
function clauseWindow(normalizedFull, matchIndex) {
  const breaks = [0];
  const re = /[,;]|(?:\s+mas\s+)/g;
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

export function inferLocalValence(normalizedFull, matchIndex) {
  const window = clauseWindow(normalizedFull, matchIndex);

  let pos = 0;
  let neg = 0;
  for (const cue of POSITIVE_CUES) {
    if (window.includes(cue)) pos++;
  }
  for (const cue of NEGATIVE_CUES) {
    if (window.includes(cue)) neg++;
  }

  if (pos > 0 && neg > 0) return 'Neutra';
  if (neg > pos) return 'Negativa';
  if (pos > neg) return 'Positiva';
  return 'Neutra';
}

/**
 * @param {string} comment
 * @returns {Array<{ topic: string, valence: string, confidence: number, matchIndex: number }>}
 */
export function classifyCommentWithRules(comment) {
  const raw = String(comment ?? '').trim();
  if (!raw) return [];

  const normalized = normalizeText(raw);
  const found = [];

  for (const topic of OFFICIAL_TOPICS) {
    const keywords = TOPIC_KEYWORD_RULES[topic] ?? [];
    let best = null;
    for (const kw of keywords) {
      const needle = normalizeText(kw);
      const idx = normalized.indexOf(needle);
      if (idx === -1) continue;
      const valence = inferLocalValence(normalized, idx);
      const confidence = Math.min(0.85, 0.45 + needle.length * 0.03);
      if (!best || confidence > best.confidence) {
        best = { topic, valence, confidence, matchIndex: idx };
      }
    }
    if (best) found.push(best);
  }

  return found;
}

/**
 * Import externo: response_id → lista de { topic, valence, confidence?, reviewed? }
 * @param {Map<string, Array<object>>} externalByResponseId
 */
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

/**
 * @param {Array<object>} responses
 * @param {object} [opts]
 * @param {Array<{ response_id: string, topics: Array<object> }>} [opts.externalImport]
 * @param {boolean} [opts.useRules]
 */
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

    const mentions = classifyCommentWithRules(comment);
    for (const m of mentions) {
      out.push({
        response_id: r.response_id,
        client_id: r.client_id ?? null,
        analytical_cycle_code: r.analytical_cycle_code,
        topic: m.topic,
        valence: m.valence,
        confidence: Math.round(m.confidence * 1000) / 1000,
        classification_source: 'rules_v1',
        reviewed: false,
      });
    }
  }

  return out;
}

export function hasCommentText(comment) {
  return Boolean(String(comment ?? '').trim());
}
