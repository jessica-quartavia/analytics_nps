/**
 * Diagnóstico Gemini — listagem de modelos + probe real (sem fallback rules_v2).
 */
import './load-dotenv.mjs';
import { loadVocAiConfig, printGeminiEnvSummary } from '../lib/analytics/voc-ai-config.mjs';
import {
  listGeminiGenerateContentModels,
  probeGeminiGenerateContent,
  assertGeminiModelAvailable,
  GeminiModelNotAvailableError,
  GeminiModelNotConfiguredError,
  GeminiApiError,
} from '../lib/analytics/voc-gemini-models.mjs';

const config = loadVocAiConfig();

console.log('Gemini VoC — test:gemini');
printGeminiEnvSummary(config);

if (!config.hasApiKey) {
  console.error('\nGEMINI_API_KEY ausente no .env');
  process.exit(1);
}

if (!config.model) {
  console.error('\nVOC_AI_MODEL ausente no .env (obrigatório para test:gemini)');
  process.exit(1);
}

let available;
try {
  available = await listGeminiGenerateContentModels(config.apiKey);
} catch (err) {
  if (err instanceof GeminiApiError) {
    console.error(`\n${err.code}`);
    console.error(JSON.stringify(err.details, null, 2));
    process.exit(1);
  }
  console.error('\nFalha ao listar modelos:', err.message);
  process.exit(1);
}

console.log('\nModelos generateContent (name / displayName):');
for (const m of available) {
  console.log(`  ${m.name}  —  ${m.displayName}`);
}

try {
  await assertGeminiModelAvailable(config.apiKey, config.model);
} catch (err) {
  if (err instanceof GeminiModelNotAvailableError) {
    console.error(`\n${err.code}: models/${err.model} não encontrado.`);
    console.error('Modelos compatíveis:');
    for (const id of err.availableGenerateContentModels) {
      console.error(`  - models/${id}`);
    }
    process.exit(1);
  }
  if (err instanceof GeminiModelNotConfiguredError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

console.log(`\nVOC_AI_MODEL models/${config.model} — presente na lista.`);

try {
  const probe = await probeGeminiGenerateContent(config.apiKey, config.model);
  console.log('\nGemini connection OK');
  console.log(`provider: ${config.provider}`);
  console.log(`model: ${probe.model}`);
  console.log(`http_status: ${probe.http_status}`);
  console.log(`latency_ms: ${probe.latency_ms}`);
  console.log(`text: ${probe.text.slice(0, 80)}`);
  console.log(`endpoint: ${probe.endpoint}`);
} catch (err) {
  if (err instanceof GeminiApiError) {
    console.error(`\n${err.code}`);
    console.error(JSON.stringify(err.details, null, 2));
    process.exit(1);
  }
  console.error('\nProbe falhou:', err.message);
  process.exit(1);
}

console.log('\nPronto para: npm run classify:voc-ai -- --limit=1');
