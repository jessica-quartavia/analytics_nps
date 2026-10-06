const crypto = require('crypto');
const OFFICIAL_TOPICS = ["Atendimento / relacionamento","Engenheiro Patrimonial","Clareza / comunicação","Proatividade","Resultados","Oportunidades","Plano patrimonial","Agilidade","Confiança","Tecnologia / plataforma","Expectativa","Valor percebido"];
const PROMPT_VERSION = 'voc-gemini-prompt-v1';
const CLASSIFIER_VERSION = 'gemini_v1';
const MODEL = 'gemini-2.0-flash';

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

function sha256(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function buildInputHash(question, answer, themes) {
  return sha256({
    question: String(question ?? ''),
    answer: String(answer ?? ''),
    candidate_themes: [...themes].sort(),
    prompt_version: PROMPT_VERSION,
    model: MODEL,
    classifier_version: CLASSIFIER_VERSION,
  });
}

function buildAnswerHash(questionKey, answerText, score, npsCat) {
  return sha256({
    question_key: questionKey,
    answer_text: String(answerText ?? ''),
    score: score ?? null,
    nps_category: npsCat ?? null,
  });
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
const input_hash = buildInputHash(question_text, answer_text, candidate_themes);
const answer_hash = buildAnswerHash(question_key, answer_text, score, nps_category);

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
    answer_hash,
    submitted_at: row.submitted_at,
    source_updated_at: row.created_at || row.submitted_at,
    programa: row.programa ?? null,
    ep: row.engenheiro_patrimonial ?? null,
    prompt_version: PROMPT_VERSION,
    classifier_version: CLASSIFIER_VERSION,
    model: MODEL,
    candidate_themes,
    input_hash,
    run_id: row.run_id,
    gemini_user_json: JSON.stringify(gemini_user_payload, null, 2),
  },
};