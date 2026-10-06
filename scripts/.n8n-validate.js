const OFFICIAL = new Set(["Atendimento / relacionamento","Engenheiro Patrimonial","Clareza / comunicação","Proatividade","Resultados","Oportunidades","Plano patrimonial","Agilidade","Confiança","Tecnologia / plataforma","Expectativa","Valor percebido"]);
const VALENCE_MAP = { positive: 'Positiva', neutral: 'Neutra', negative: 'Negativa', positiva: 'Positiva', neutra: 'Neutra', negativa: 'Negativa' };
const unit = $('Prepare VoC Input').item.json;
const sd = $getWorkflowStaticData('global');

function parseGeminiRaw(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();
  try { return JSON.parse(text); } catch { return null; }
}

const raw = $json.output ?? $json.text ?? $json.content ?? $json;
const parsed = parseGeminiRaw(raw);
if (!parsed) {
  sd.pending_unit_tally = { invalid_outputs: 1, unit_failed: true };
  return { json: { valid: false, unit, error: 'invalid_json' } };
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
  const confidence = Number(t.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
  rows.push({ theme, valence, confidence, evidence: String(t.evidence || parsed.summary || '').slice(0, 500), needs_human_review: confidence < 0.65 });
}

for (const c of legacy) {
  const theme = c.theme;
  if (!theme || !OFFICIAL.has(theme)) continue;
  const valence = VALENCE_MAP[String(c.valence || '').toLowerCase()] || c.valence;
  if (!['Positiva', 'Neutra', 'Negativa'].includes(valence)) continue;
  const confidence = Number(c.confidence);
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
  sd.pending_unit_tally = { invalid_outputs: 1, unit_failed: true };
  return { json: { valid: false, unit, error: 'no_valid_topics' } };
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