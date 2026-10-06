/**
 * Snippets para Code nodes n8n — trilha Gemini nativa (sem Vercel).
 * Taxonomia alinhada a lib/analytics/voc-config.mjs e voc-gemini-prompt.mjs
 */

export const OFFICIAL_TOPICS = [
  'Atendimento / relacionamento',
  'Engenheiro Patrimonial',
  'Clareza / comunicação',
  'Proatividade',
  'Resultados',
  'Oportunidades',
  'Plano patrimonial',
  'Agilidade',
  'Confiança',
  'Tecnologia / plataforma',
  'Expectativa',
  'Valor percebido',
];

export const VOC_GEMINI_PROMPT_VERSION = 'voc-gemini-prompt-v1';
export const VOC_GEMINI_CLASSIFIER_VERSION = 'gemini_v1';
export const VOC_GEMINI_MODEL = 'gemini-3.5-flash';

/** Alinhado a lib/analytics/voc-gemini-prompt.mjs buildGeminiSystemInstruction() */
export const GEMINI_SYSTEM_INSTRUCTION = `Você é um classificador de Voice of Customer (VoC) em português do Brasil.

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

/** lib/analytics/voc-gemini-client.mjs CLASSIFIER_RESPONSE_SCHEMA */
export const GEMINI_CLASSIFIER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          valence: { type: 'string' },
          confidence: { type: 'number' },
          evidence: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['theme', 'valence', 'confidence', 'evidence', 'reason'],
      },
    },
    no_additional_comment: { type: 'boolean' },
  },
  required: ['classifications'],
};

export const GEMINI_HTTP_GENERATE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

/** Code node: POST generateContent via googlePalmApi credential (x-goog-api-key, sem expor chave). */
export function httpGeminiClassifyJsCode() {
  return `
const unit = $json;
const url = '${GEMINI_HTTP_GENERATE_URL}';

function sanitize(msg) {
  return String(msg ?? '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/key=[^&\\s]+/gi, 'key=[REDACTED]')
    .slice(0, 500);
}

const retryable = (status) => status === 429 || (status != null && status >= 500);
let lastErr = null;

for (let attempt = 0; attempt < 3; attempt++) {
  if (attempt > 0) await new Promise((r) => setTimeout(r, 5000));
  try {
    const response = await this.helpers.httpRequestWithAuthentication.call(this, 'googlePalmApi', {
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: unit.gemini_http_body,
      json: true,
      timeout: 60000,
    });
    return { json: response };
  } catch (e) {
    const status = e.statusCode ?? e.response?.statusCode ?? e.httpCode ?? null;
    lastErr = { status, message: sanitize(e.message ?? e.description ?? 'gemini_http_failed'), attempt: attempt + 1 };
    if (!retryable(status)) break;
  }
}

const err = new Error(lastErr?.message ?? 'gemini_http_failed');
err.statusCode = lastErr?.status ?? null;
err.attempt = lastErr?.attempt ?? 3;
throw err;
`.trim();
}

/** @returns {string} jsCode for "Build Gemini HTTP Body" */
export function buildGeminiHttpBodyJsCode() {
  return `
const unit = $('Merge Voc Hashes').item.json;
const SYSTEM = ${JSON.stringify(GEMINI_SYSTEM_INSTRUCTION)};
const RESPONSE_SCHEMA = ${JSON.stringify(GEMINI_CLASSIFIER_RESPONSE_SCHEMA)};
const userText = unit.gemini_user_json;
const gemini_http_body = {
  systemInstruction: { parts: [{ text: SYSTEM }] },
  contents: [{ role: 'user', parts: [{ text: userText }] }],
  generationConfig: {
    temperature: 0.1,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  },
};
return { json: { ...unit, gemini_http_body } };
`.trim();
}

/** @returns {string} jsCode for "Native Gemini Error" (HTTP + LangChain) */
export function nativeGeminiErrorJsCode() {
  return `
const unit = $('Merge Voc Hashes').item.json;
const sd = $getWorkflowStaticData('global');

function sanitize(msg) {
  return String(msg ?? '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/key=[^&\\s]+/gi, 'key=[REDACTED]')
    .replace(/x-goog-api-key[^\\s]*/gi, '[REDACTED_HEADER]')
    .replace(/Bearer\\s+\\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 500);
}

let status = $json.statusCode ?? $json.httpCode ?? $json.error?.status ?? null;
const rawMsg = $json.error?.message ?? $json.message ?? $json.description ?? $json.error ?? 'gemini_failed';
const msgStr = String(rawMsg);
if (status == null && /too many requests|resource exhausted|rate limit|429/i.test(msgStr)) status = 429;
let category = 'unknown';
if (status === 429) category = 'rate_limit';
else if (status >= 500) category = 'server_error';
else if (status === 408 || /timeout|abort/i.test(String(rawMsg))) category = 'timeout';
else if (status === 401 || status === 403) category = 'auth_failed';
else if (status === 400) category = 'bad_request';
else if (status >= 400) category = 'client_error';

if (!Array.isArray(sd.voc_invalid_diagnostics)) sd.voc_invalid_diagnostics = [];
if (sd.voc_invalid_diagnostics.length < 20) {
  sd.voc_invalid_diagnostics.push({
    category: status === 429 ? 'HTTP_429' : status >= 500 ? 'HTTP_5XX' : status === 400 ? 'HTTP_400' : 'HTTP_ERROR',
    source_response_id: unit.source_response_id,
    question_key: unit.question_key,
    http_status: status,
    error_category: category,
    message_preview: sanitize(rawMsg),
    timestamp: new Date().toISOString(),
  });
}

const tally = { invalid_outputs: 1, unit_failed: true };
if (status === 429) tally.http_429 = 1;
else if (status >= 500) tally.http_503 = 1;
else if (status === 408 || /timeout|abort/i.test(msgStr)) tally.timeouts = 1;
sd.pending_unit_tally = tally;

return {
  json: {
    ok: false,
    response_id: unit.source_response_id,
    stage: 'gemini_classify',
    http_status: status,
    error_category: category,
    message: sanitize(rawMsg),
    attempt: typeof $runIndex === 'number' ? $runIndex + 1 : 1,
    timestamp: new Date().toISOString(),
  },
};
`.trim();
}

/** @returns {string} jsCode for n8n node "Prepare VoC Input" */
export function prepareVoCInputJsCode() {
  return `
const OFFICIAL_TOPICS = ${JSON.stringify(OFFICIAL_TOPICS)};
const PROMPT_VERSION = '${VOC_GEMINI_PROMPT_VERSION}';
const CLASSIFIER_VERSION = '${VOC_GEMINI_CLASSIFIER_VERSION}';
const MODEL = '${VOC_GEMINI_MODEL}';

function npsCategory(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s >= 9) return 'Promotor';
  if (s >= 7) return 'Neutro';
  return 'Detrator';
}

function resolveCycle(submittedAt, cycles) {
  const t = submittedAt ? new Date(submittedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  for (const c of cycles || []) {
    const start = c.starts_at ? new Date(c.starts_at).getTime() : 0;
    const end = c.ends_at ? new Date(c.ends_at).getTime() : Infinity;
    if (t >= start && t <= end) return c.name || String(c.id);
  }
  const sorted = [...(cycles || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const last = sorted[sorted.length - 1];
  return last ? (last.name || String(last.id)) : null;
}

const row = $json;
const comment = String(row.comment || '').trim();
if (!comment) return [];

const cycles = row.source_cycles || $('Fetch NPS Cycles').all().map(i => i.json);
const score = row.score != null ? Number(row.score) : null;
const nps_category = npsCategory(score);
const question_key = 'nps_comment';
const question_text = 'Comentário NPS';
const answer_text = comment;
const analytical_cycle_code = resolveCycle(row.submitted_at, cycles);
const candidate_themes = OFFICIAL_TOPICS;
const hash_input_json = JSON.stringify({
  question: question_text,
  answer: answer_text,
  candidate_themes: [...candidate_themes].sort(),
  prompt_version: PROMPT_VERSION,
  model: MODEL,
  classifier_version: CLASSIFIER_VERSION,
});
const hash_answer_json = JSON.stringify({
  question_key,
  answer_text,
  score,
  nps_category,
});

const gemini_user_payload = {
  prompt_version: PROMPT_VERSION,
  allowed_themes: OFFICIAL_TOPICS,
  allowed_valences: ['Positiva', 'Neutra', 'Negativa'],
  response_context: { score, nps_category },
  segments: [{ question: question_text, answer: answer_text, candidate_themes }],
  output_schema: {
    topics: [{ topic: 'string', valence: 'positive|neutral|negative', confidence: 0.0 }],
    overall_valence: 'positive|neutral|negative',
    has_actionable_feedback: true,
    summary: 'string',
    classifications: [{ theme: 'string', valence: 'Positiva|Neutra|Negativa', confidence: 0.0, evidence: 'string', reason: 'string' }],
  },
};

return {
  json: {
    response_id: row.id,
    source_response_id: String(row.id),
    client_id: row.client_id,
    analytical_cycle_code,
    score,
    nps_category,
    question_key,
    question_text,
    answer_text,
    submitted_at: row.submitted_at,
    source_updated_at: row.created_at || row.submitted_at,
    programa: row.programa ?? null,
    ep: row.engenheiro_patrimonial ?? null,
    prompt_version: PROMPT_VERSION,
    classifier_version: CLASSIFIER_VERSION,
    model: MODEL,
    candidate_themes,
    hash_input_json,
    hash_answer_json,
    run_id: row.run_id,
    gemini_user_json: JSON.stringify(gemini_user_payload, null, 2),
  },
};
`.trim();
}

/** @returns {string} jsCode for n8n node "Validate VoC Output" */
export function validateVoCOutputJsCode() {
  return `
const OFFICIAL = new Set(${JSON.stringify(OFFICIAL_TOPICS)});
const VALENCE_MAP = { positive: 'Positiva', neutral: 'Neutra', negative: 'Negativa', positiva: 'Positiva', neutra: 'Neutra', negativa: 'Negativa' };
const unit = $('Merge Voc Hashes').item.json;
const sd = $getWorkflowStaticData('global');

function parseGeminiRaw(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  let text = String(raw).trim();
  const fence = text.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`/i);
  if (fence) text = fence[1].trim();
  try { return JSON.parse(text); } catch { return null; }
}

function geminiApiText(body) {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length) {
    return parts.map((p) => p?.text).filter(Boolean).join('');
  }
  return body?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

function extractParsed(body) {
  const apiText = geminiApiText(body);
  const candidates = [
    body?.output,
    body?.text,
    body?.content,
    body?.data,
    body?.response,
    apiText,
    body,
  ];
  for (const c of candidates) {
    const p = parseGeminiRaw(c);
    if (p && (Array.isArray(p.topics) || Array.isArray(p.classifications))) return p;
  }
  return null;
}

function pushInvalidDiag(entry) {
  if (!Array.isArray(sd.voc_invalid_diagnostics)) sd.voc_invalid_diagnostics = [];
  if (sd.voc_invalid_diagnostics.length >= 20) return;
  sd.voc_invalid_diagnostics.push(entry);
}

function sanitizeRawPreview(raw) {
  return String(raw ?? '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .slice(0, 800);
}

function classifyInvalid(body, parsed, rows, rawLegacy, rawTopics) {
  const cand = body?.candidates?.[0];
  const finishReason = cand?.finishReason ?? null;
  const blockReason = body?.promptFeedback?.blockReason ?? null;
  const apiText = geminiApiText(body);
  if (blockReason) return 'SAFETY_BLOCK';
  if (!body?.candidates?.length) return 'EMPTY_RESPONSE';
  if (finishReason === 'MAX_TOKENS') return 'TRUNCATED';
  if (!apiText || !String(apiText).trim()) return 'EMPTY_RESPONSE';
  if (!parsed) return 'JSON_PARSE_ERROR';
  const legacy = Array.isArray(parsed.classifications) ? parsed.classifications : [];
  const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
  if (!legacy.length && !topics.length) return 'SCHEMA_ERROR';
  if (rows.length) return 'UNKNOWN';
  if (rawLegacy.length || rawTopics.length) return 'INVALID_TOPIC';
  return 'SCHEMA_ERROR';
}

const geminiBody = $json;
const parsed = extractParsed(geminiBody);
const apiText = geminiApiText(geminiBody);
const finishReason = geminiBody?.candidates?.[0]?.finishReason ?? null;

if (!parsed) {
  const category = classifyInvalid(geminiBody, null, [], [], []);
  pushInvalidDiag({
    category,
    source_response_id: unit.source_response_id,
    question_key: unit.question_key,
    finishReason,
    candidate_count: geminiBody?.candidates?.length ?? 0,
    raw_text_preview: sanitizeRawPreview(apiText),
    validation_error: 'invalid_json',
    response_length: apiText ? String(apiText).length : 0,
    has_markdown_fence: String(apiText || '').indexOf(String.fromCharCode(96, 96, 96)) >= 0,
    timestamp: new Date().toISOString(),
  });
  sd.pending_unit_tally = { invalid_outputs: 1, unit_failed: true };
  return { json: { valid: false, unit, error: 'invalid_json', invalid_category: category } };
}

const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
const legacy = Array.isArray(parsed.classifications) ? parsed.classifications : [];
const rows = [];

for (const t of topics) {
  const theme = t.topic || t.theme;
  if (!theme || !OFFICIAL.has(theme)) continue;
  const vKey = String(t.valence || '').toLowerCase();
  const valence = VALENCE_MAP[vKey] || VALENCE_MAP[String(t.valence || '')] || null;
  if (!valence) continue;
  let confidence = Number(t.confidence);
  if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
  rows.push({ theme, valence, confidence, evidence: String(t.evidence || parsed.summary || '').slice(0, 500), needs_human_review: confidence < 0.65 });
}

for (const c of legacy) {
  const theme = c.theme;
  if (!theme || !OFFICIAL.has(theme)) continue;
  const valence = VALENCE_MAP[String(c.valence || '').toLowerCase()] || c.valence;
  if (!['Positiva', 'Neutra', 'Negativa'].includes(valence)) continue;
  let confidence = Number(c.confidence);
  if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
  rows.push({ theme, valence, confidence, evidence: String(c.evidence || '').slice(0, 500), needs_human_review: confidence < 0.65 || Boolean(c.needs_human_review) });
}

const seen = new Set();
const classifications = [];
for (const r of rows) {
  if (seen.has(r.theme)) continue;
  seen.add(r.theme);
  classifications.push({ ...r, classifier_source: 'gemini', valence_reason: r.evidence });
}

if (!classifications.length && !String(unit.answer_text || '').trim()) {
  return { json: { valid: true, unit, classify: { ok: true, classifications: [], classifier_source: 'gemini', prompt_version: unit.prompt_version, classifier_version: unit.classifier_version, provider: 'gemini', model: unit.model } } };
}

if (!classifications.length) {
  const category = classifyInvalid(geminiBody, parsed, rows, legacy, topics);
  pushInvalidDiag({
    category,
    source_response_id: unit.source_response_id,
    question_key: unit.question_key,
    finishReason,
    candidate_count: geminiBody?.candidates?.length ?? 0,
    raw_classifications_count: legacy.length,
    raw_topics_count: topics.length,
    raw_themes_sample: legacy.map((c) => c.theme).filter(Boolean).slice(0, 8),
    raw_valences_sample: legacy.map((c) => c.valence).filter(Boolean).slice(0, 8),
    validation_error: 'no_valid_topics',
    raw_text_preview: sanitizeRawPreview(apiText),
    response_length: apiText ? String(apiText).length : 0,
    has_markdown_fence: String(apiText || '').indexOf(String.fromCharCode(96, 96, 96)) >= 0,
    timestamp: new Date().toISOString(),
  });
  sd.pending_unit_tally = { invalid_outputs: 1, unit_failed: true };
  return { json: { valid: false, unit, error: 'no_valid_topics', invalid_category: category } };
}

const unitLow = classifications.some(c => c.needs_human_review);
sd.pending_unit_tally = { gemini: 1, low_confidence: unitLow };

return {
  json: {
    valid: true,
    unit,
    classify: {
      ok: true,
      classifications,
      classifier_source: 'gemini',
      prompt_version: unit.prompt_version,
      classifier_version: unit.classifier_version,
      provider: 'gemini',
      model: unit.model,
      overall_valence: parsed.overall_valence,
      summary: parsed.summary,
    },
  },
};
`.trim();
}
