/**
 * Relê artefatos de QA VoC IA (sem chamar Gemini).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const qaPath = join(root, 'data/quality/voc_ai_classification_qa.json');
const vsPath = join(root, 'data/quality/voc_ai_vs_rules_audit.json');

if (!existsSync(qaPath)) {
  console.error('Execute primeiro: npm run classify:voc-ai');
  process.exit(1);
}

const qa = JSON.parse(readFileSync(qaPath, 'utf8'));
const vs = existsSync(vsPath) ? JSON.parse(readFileSync(vsPath, 'utf8')) : null;

console.log('VoC IA QA —', qa.generated_at);
console.log(`  classificações: ${qa.total_classifications}`);
console.log(`  gemini: ${qa.gemini_classifications} · fallback: ${qa.fallback_classifications}`);
console.log(`  baixa confiança: ${qa.low_confidence_rows}`);
if (vs) {
  console.log(`  vs rules_v2: ${vs.total_changed} mudanças · Promotor+Negativa rules=${vs.promoter_negative_rules} ai=${vs.promoter_negative_ai}`);
}
