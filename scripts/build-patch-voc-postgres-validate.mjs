import { validateVoCOutputJsCode } from './n8n-voc-native-gemini-nodes.mjs';
import fs from 'fs';

const computeQuery = `WITH payload AS (
  SELECT *
  FROM jsonb_to_record($1::jsonb) AS x(
    hash_input_json text,
    hash_answer_json text
  )
)
SELECT
  encode(digest(x.hash_input_json, 'sha256'), 'hex') AS input_hash,
  encode(digest(x.hash_answer_json, 'sha256'), 'hex') AS answer_hash
FROM payload x;`;

const aiCacheQuery = `WITH payload AS (
  SELECT *
  FROM jsonb_to_record($1::jsonb) AS x(
    input_hash text,
    question_text text,
    answer_text text,
    candidate_themes jsonb,
    provider text,
    model text,
    prompt_version text,
    classifier_version text,
    result jsonb
  )
)
INSERT INTO analytics_nps.voc_ai_cache (
  input_hash, question_text, answer_text, candidate_themes, provider, model,
  prompt_version, classifier_version, result, last_used_at
)
SELECT
  x.input_hash, x.question_text, x.answer_text, x.candidate_themes, x.provider, x.model,
  x.prompt_version, x.classifier_version, x.result, NOW()
FROM payload x
ON CONFLICT (input_hash) DO UPDATE SET
  result = EXCLUDED.result,
  last_used_at = NOW();`;

const payload = {
  workflowId: 'ENqJyEuulA0vzoI6',
  versionName: 'jsonb hashes cache + validate diag',
  operations: [
    {
      type: 'updateNodeParameters',
      nodeName: 'Compute Voc Hashes',
      parameters: {
        operation: 'executeQuery',
        query: computeQuery,
        options: {
          queryReplacement:
            "={{ JSON.stringify({ hash_input_json: $('Prepare VoC Input').item.json.hash_input_json, hash_answer_json: $('Prepare VoC Input').item.json.hash_answer_json }) }}",
        },
      },
    },
    {
      type: 'updateNodeParameters',
      nodeName: 'Upsert AI Cache',
      parameters: {
        operation: 'executeQuery',
        query: aiCacheQuery,
        options: {
          queryReplacement:
            "={{ JSON.stringify({ input_hash: $('Merge voc_response_id').item.json.input_hash, question_text: $('Merge voc_response_id').item.json.question_text, answer_text: $('Merge voc_response_id').item.json.answer_text, candidate_themes: $('Merge voc_response_id').item.json.candidate_themes, provider: $json.provider || 'gemini', model: $json.model || 'gemini-3.6-flash', prompt_version: $json.prompt_version || 'voc-gemini-prompt-v1', classifier_version: $json.classifier_version || 'gemini_v1', result: { classifications: $json.classifications || [] } }) }}",
        },
      },
    },
    {
      type: 'updateNodeParameters',
      nodeName: 'Validate VoC Output',
      parameters: { mode: 'runOnceForEachItem', jsCode: validateVoCOutputJsCode() },
    },
  ],
};

fs.writeFileSync('scripts/patch-voc-postgres-validate.json', JSON.stringify(payload));
fs.writeFileSync('scripts/backup-compute-voc-hashes-sql-after.sql', computeQuery);
fs.writeFileSync('scripts/backup-upsert-ai-cache-sql-after.sql', aiCacheQuery);
console.log('patch ready', payload.operations.length);
