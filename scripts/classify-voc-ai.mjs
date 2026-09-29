/**
 * Classifica valência VoC via Gemini (temas determinísticos + IA).
 * Materialize só com --materialize (não usar neste debug).
 */
import './load-dotenv.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResponseTopicsRows } from '../lib/analytics/voc-classifier.mjs';
import {
  buildResponseTopicsRowsWithAiValence,
  classifyResponseValenceWithAi,
  findFirstClassifiableVocResponse,
} from '../lib/analytics/voc-ai-classifier.mjs';
import { buildVocValenceUnits } from '../lib/analytics/voc-ai-segments.mjs';
import { buildVocArtifacts } from '../lib/analytics/voc-pipeline.mjs';
import { loadVocAiConfig, printGeminiEnvSummary, createEmptyGeminiRunStats } from '../lib/analytics/voc-ai-config.mjs';
import { buildAiQaReport, buildAiVsRulesAudit } from '../lib/analytics/voc-ai-audit.mjs';
import {
  assertGeminiModelAvailable,
  GeminiModelNotAvailableError,
  GeminiApiError,
} from '../lib/analytics/voc-gemini-models.mjs';
import { loadVocAiCache } from '../lib/analytics/voc-ai-cache.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

function parseLimitArg() {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  if (!arg) return null;
  const n = Number(arg.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const config = loadVocAiConfig();
const limit = parseLimitArg();
const materialize = process.argv.includes('--materialize') || config.useGeminiPrimary;

console.log('Gemini VoC');
printGeminiEnvSummary(config);
console.log(`enabled: ${config.useGemini}`);
console.log(`key present: ${config.hasApiKey}`);

if (config.hasApiKey && !config.hasModel) {
  console.error('\nVOC_AI_MODEL é obrigatório quando GEMINI_API_KEY está definida.');
  process.exit(1);
}

if (config.hasApiKey && config.hasModel) {
  try {
    await assertGeminiModelAvailable(config.apiKey, config.model);
    console.log(`Modelo models/${config.model} validado (generateContent).`);
  } catch (err) {
    if (err instanceof GeminiModelNotAvailableError) {
      console.error(`\n${err.code}: models/${err.model}`);
      console.error('Modelos compatíveis:');
      for (const id of err.availableGenerateContentModels) {
        console.error(`  - models/${id}`);
      }
      process.exit(1);
    }
    if (err instanceof GeminiApiError) {
      console.error(`\n${err.code}`, JSON.stringify(err.details, null, 2));
      process.exit(1);
    }
    console.error('Falha ao validar modelo:', err.message);
    process.exit(1);
  }
}

const responses = readJson('data/processed/responses.json');

if (limit === 1) {
  const sample = findFirstClassifiableVocResponse(responses);
  if (!sample) {
    console.error('Nenhuma resposta com unidades VoC classificáveis.');
    process.exit(1);
  }
  const { units } = buildVocValenceUnits(sample.comment);
  console.log('\n--- Probe 1 classificação VoC (sem materializar) ---');
  console.log(
    JSON.stringify(
      {
        response_id: sample.response_id,
        score: sample.score,
        nps_category: sample.nps_category,
        segments: units.map((u) => ({
          question: u.question?.slice(0, 120),
          answer: u.answer?.slice(0, 200),
          candidate_themes: u.candidate_themes,
        })),
      },
      null,
      2,
    ),
  );

  const stats = createEmptyGeminiRunStats();
  const collectMeta = { last: null };
  const cacheDoc = loadVocAiCache();
  const rows = await classifyResponseValenceWithAi(sample, {
    config,
    stats,
    cacheDoc,
    skipNetwork: !config.geminiConfigured || !config.useGemini,
    collectMeta,
  });

  console.log('\nResultado:');
  for (const row of rows) {
    console.log(
      JSON.stringify(
        {
          classifier_source: row.classifier_source,
          topic: row.topic,
          valence: row.valence,
          confidence: row.confidence,
          evidence: row.evidence,
          valence_reason: row.valence_reason,
          fallback_reason: row.fallback_reason ?? null,
          model: row.ai_model ?? config.model,
          latency_ms: collectMeta.last?.latency_ms ?? null,
        },
        null,
        2,
      ),
    );
  }
  console.log('\nContadores:', JSON.stringify(stats, null, 2));
  if (config.useGemini && stats.successful_gemini === 0) {
    console.error('\n⚠ WARNING: Gemini habilitado (VOC_USE_GEMINI=1) mas nenhuma classificação Gemini concluída.');
    console.error('fallback_reasons:', stats.fallback_reasons);
    if (collectMeta.last) {
      console.error(
        'Diagnóstico Gemini:',
        JSON.stringify(
          {
            http_status: collectMeta.last.http_status,
            errorCode: collectMeta.last.errorCode,
            parse_error: collectMeta.last.parse_error ?? null,
            schema_error: collectMeta.last.schema_error ?? null,
            model_text_preview: collectMeta.last.model_text_preview ?? null,
          },
          null,
          2,
        ),
      );
    }
    process.exit(1);
  }
  process.exit(0);
}

const cycles = readJson('data/processed/cycles.json');
const cycleSummary = readJson('data/processed/cycle_summary.json');
const dataCutoff = cycleSummary.data_cutoff ?? new Date().toISOString();

const rulesRows = buildResponseTopicsRows(responses, { useRules: true });

if (!config.geminiConfigured) {
  console.log('\nGEMINI_API_KEY ou VOC_AI_MODEL ausente — apenas fallback rules_v2.');
}

const skipNetwork = !config.geminiConfigured || !config.useGemini;

const { rows: aiRows, stats } = await buildResponseTopicsRowsWithAiValence(responses, {
  saveCache: true,
  config,
  skipNetwork,
});

const qa = buildAiQaReport({ rows: aiRows, stats, config, responses });
const vsRules = buildAiVsRulesAudit(rulesRows, aiRows, responses);

writeFileSync(join(root, 'data/quality/voc_ai_classification_qa.json'), JSON.stringify({ ...qa, run_stats: stats }, null, 2) + '\n', 'utf8');
writeFileSync(join(root, 'data/quality/voc_ai_vs_rules_audit.json'), JSON.stringify(vsRules, null, 2) + '\n', 'utf8');

console.log('\n--- Execução ---');
console.log(JSON.stringify(stats, null, 2));
console.log(`\nClassificações: ${aiRows.length} · gemini rows: ${aiRows.filter((r) => r.classifier_source === 'gemini').length}`);
console.log(`vs rules_v2: ${vsRules.total_changed}/${vsRules.total_classifications_comparable} diferentes`);

if (config.useGemini && stats.successful_gemini === 0) {
  console.error('\n⚠ WARNING: Gemini está habilitado (VOC_USE_GEMINI=1), mas nenhuma classificação Gemini foi concluída.');
  console.error('Distribuição fallback_reason:', stats.fallback_reasons);
}

if (materialize) {
  const { responseTopics, topicSummary } = await buildVocArtifacts(responses, cycles, dataCutoff, {
    loadExternalPath: true,
    useGemini: true,
    saveCache: false,
  });
  writeFileSync(join(root, 'data/processed/response_topics.json'), JSON.stringify(responseTopics, null, 2) + '\n', 'utf8');
  writeFileSync(join(root, 'data/processed/topic_summary.json'), JSON.stringify(topicSummary, null, 2) + '\n', 'utf8');
  console.log('Materializado processed/ (gemini_v1)');
} else {
  console.log('\nSem materialização (--materialize não usado). QA em data/quality/.');
}
