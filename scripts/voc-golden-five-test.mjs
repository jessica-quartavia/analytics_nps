/**
 * Valida 5 casos VoC via classificador oficial (sem materializar / sem DB).
 */
import './load-dotenv.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyResponseValenceWithAi } from '../lib/analytics/voc-ai-classifier.mjs';
import { loadVocAiConfig, createEmptyGeminiRunStats } from '../lib/analytics/voc-ai-config.mjs';
import { classifyCommentWithRules } from '../lib/analytics/voc-classifier.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const responses = JSON.parse(readFileSync(join(root, 'data/processed/responses.json'), 'utf8'));

function findByName(part) {
  return responses.find((r) => r.client_name?.includes(part));
}

const CASES = [
  { label: 'Aguinaldo', match: 'Aguinaldo Vieira', checks: (rows) => {
    const cl = rows.find((r) => r.topic === 'Clareza / comunicação');
    const pl = rows.find((r) => r.topic === 'Plano patrimonial');
    const res = rows.find((r) => r.topic === 'Resultados');
    return cl?.valence === 'Positiva' && pl?.valence === 'Positiva' && (!res || res.valence === 'Neutra');
  }},
  { label: 'Fernando', match: 'Fernando', checks: (rows) =>
    rows.some((r) => r.valence === 'Positiva') && rows.filter((r) => r.topic === 'Resultados').every((r) => r.valence !== 'Negativa'),
  },
  { label: 'Lenis', match: 'Lenis', checks: (rows) => rows.some((r) => r.valence === 'Negativa') },
  { label: 'Ademir', match: 'Ademir', checks: (rows) => {
    const at = rows.find((r) => r.topic === 'Atendimento / relacionamento');
    const cl = rows.find((r) => r.topic === 'Clareza / comunicação');
    return at?.valence === 'Positiva' && cl?.valence === 'Positiva';
  }},
  { label: 'Detrator crítica', match: null, checks: (rows) => rows.some((r) => r.valence === 'Negativa') },
];

async function classifyOne(response) {
  const config = loadVocAiConfig();
  const stats = createEmptyGeminiRunStats();
  const rows = await classifyResponseValenceWithAi(response, {
    config,
    stats,
    skipNetwork: !config.geminiConfigured || !config.useGemini,
    cacheDoc: { version: 1, entries: {} },
  });
  return { rows, stats, source: rows[0]?.classifier_source };
}

async function main() {
  const detractor = responses.find((r) => r.nps_category === 'Detrator' && r.comment?.match(/não|nao|ruim|péssim|horrível|decepcion/i));
  let failed = 0;
  for (const c of CASES) {
    const r = c.match ? findByName(c.match) : detractor;
    if (!r) {
      console.error(`SKIP ${c.label}: resposta não encontrada`);
      failed += 1;
      continue;
    }
    const { rows, stats, source } = await classifyOne(r);
    const ok = c.checks(rows);
    console.log(JSON.stringify({ case: c.label, ok, source, stats, topics: rows.map((x) => ({ t: x.topic, v: x.valence, c: x.confidence })) }, null, 2));
    if (!ok) failed += 1;
  }
  process.exit(failed ? 1 : 0);
}

main();
