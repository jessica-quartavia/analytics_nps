/**
 * Gera batches de operations para MCP update_workflow (stdout JSON).
 * Uso: node scripts/apply-n8n-native-gemini.mjs batch2 | ...
 */
import {
  prepareVoCInputJsCode,
  validateVoCOutputJsCode,
  buildGeminiHttpBodyJsCode,
  httpGeminiClassifyJsCode,
  nativeGeminiErrorJsCode,
  GEMINI_HTTP_GENERATE_URL,
  GEMINI_SYSTEM_INSTRUCTION,
} from './n8n-voc-native-gemini-nodes.mjs';

const GEMINI_PALM_CRED = { id: 'EgekvNLx5SC4VmpD', name: 'Dados_Key' };

const WORKFLOW_ID = 'ENqJyEuulA0vzoI6';
const batch = process.argv[2] || 'batch2';

function baseOps() {
  return {
    workflowId: WORKFLOW_ID,
    versionName: `Native Gemini ${batch}`,
  };
}

if (batch === 'batch2') {
  const payload = {
    ...baseOps(),
    operations: [
      { type: 'removeConnection', source: 'Loop Responses', target: 'HTTP VoC Prepare', sourceIndex: 1 },
      { type: 'removeConnection', source: 'Merge voc_response_id', target: 'Check Existing Classification' },
      { type: 'removeConnection', source: 'Unit Done Counters', target: 'Loop VoC Units' },
      { type: 'addConnection', source: 'Merge voc_response_id', target: 'Expand Classifications' },
      { type: 'addConnection', source: 'Unit Done Counters', target: 'Loop Responses' },
      {
        type: 'addNode',
        node: {
          name: 'Prepare VoC Input',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [1728, 160],
          parameters: { jsCode: prepareVoCInputJsCode() },
        },
      },
    ],
  };
  console.log(JSON.stringify(payload));
} else if (batch === 'batch3') {
  const payload = {
    ...baseOps(),
    operations: [
      {
        type: 'addNode',
        node: {
          name: 'Check Native Idempotency',
          type: 'n8n-nodes-base.postgres',
          typeVersion: 2.7,
          position: [1968, 160],
          parameters: {
            operation: 'executeQuery',
            query:
              'SELECT COUNT(*)::int AS cls_count FROM analytics_nps.voc_classifications WHERE source_response_id = $1 AND prompt_version = $2 AND classifier_version = $3;',
            options: {
              queryReplacement:
                "={{ $('Prepare VoC Input').item.json.source_response_id }},={{ $('Prepare VoC Input').item.json.prompt_version }},={{ $('Prepare VoC Input').item.json.classifier_version }}",
            },
          },
          credentials: { postgres: { id: '4PpLgshHFesCFajW', name: 'Postgres - Business Data' } },
        },
      },
      {
        type: 'addNode',
        node: {
          name: 'IF Needs Native Classify',
          type: 'n8n-nodes-base.if',
          typeVersion: 2.3,
          position: [2208, 160],
          parameters: {
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
              conditions: [
                {
                  id: 'forceN',
                  leftValue: "={{ $('Set Voc Config').first().json.force }}",
                  rightValue: true,
                  operator: { type: 'boolean', operation: 'true' },
                },
                {
                  id: 'cls0n',
                  leftValue: '={{ $json.cls_count }}',
                  rightValue: 0,
                  operator: { type: 'number', operation: 'equals' },
                },
              ],
              combinator: 'or',
            },
          },
        },
      },
      {
        type: 'addNode',
        node: {
          name: 'Gemini VoC Classify',
          type: '@n8n/n8n-nodes-langchain.googleGemini',
          typeVersion: 1.2,
          position: [2448, 160],
          parameters: {
            resource: 'text',
            operation: 'message',
            modelId: { __rl: true, mode: 'id', value: 'models/gemini-2.0-flash' },
            jsonOutput: true,
            simplify: true,
            builtInTools: { googleSearch: false, urlContext: false, codeExecution: false },
            messages: { values: [{ role: 'user', content: "={{ $('Prepare VoC Input').item.json.gemini_user_json }}" }] },
            options: {
              systemMessage: GEMINI_SYSTEM_INSTRUCTION,
              maxOutputTokens: 4096,
              temperature: 0.2,
            },
          },
          credentials: { googlePalmApi: { id: 'LvUlYcPPNaFsOroM', name: 'Google Gemini - Ferramentas' } },
        },
      },
      {
        type: 'addNode',
        node: {
          name: 'Validate VoC Output',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [2688, 160],
          parameters: { mode: 'runOnceForEachItem', jsCode: validateVoCOutputJsCode() },
        },
      },
      {
        type: 'addNode',
        node: {
          name: 'IF Native Valid',
          type: 'n8n-nodes-base.if',
          typeVersion: 2.3,
          position: [2928, 160],
          parameters: {
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
              conditions: [
                {
                  id: 'valid1',
                  leftValue: '={{ $json.valid }}',
                  rightValue: true,
                  operator: { type: 'boolean', operation: 'true' },
                },
              ],
              combinator: 'and',
            },
          },
        },
      },
      {
        type: 'addNode',
        node: {
          name: 'Native Gemini Error',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [2688, 320],
          parameters: {
            mode: 'runOnceForEachItem',
            jsCode:
              "const sd = $getWorkflowStaticData('global'); sd.pending_unit_tally = { invalid_outputs: 1, unit_failed: true }; return { json: { ok: false } };",
          },
        },
      },
    ],
  };
  console.log(JSON.stringify(payload));
} else if (batch === 'batch4') {
  const payload = {
    ...baseOps(),
    operations: [
      { type: 'addConnection', source: 'Loop Responses', target: 'Prepare VoC Input', sourceIndex: 1 },
      { type: 'addConnection', source: 'Prepare VoC Input', target: 'Check Native Idempotency' },
      { type: 'addConnection', source: 'Check Native Idempotency', target: 'IF Needs Native Classify' },
      { type: 'addConnection', source: 'IF Needs Native Classify', target: 'Gemini VoC Classify', sourceIndex: 0 },
      { type: 'addConnection', source: 'IF Needs Native Classify', target: 'Unit Done Counters', sourceIndex: 1 },
      { type: 'addConnection', source: 'Gemini VoC Classify', target: 'Validate VoC Output' },
      { type: 'addConnection', source: 'Validate VoC Output', target: 'IF Native Valid' },
      { type: 'addConnection', source: 'IF Native Valid', target: 'Upsert voc_response', sourceIndex: 0 },
      { type: 'addConnection', source: 'IF Native Valid', target: 'Unit Done Counters', sourceIndex: 1 },
      { type: 'addConnection', source: 'Gemini VoC Classify', target: 'Native Gemini Error', sourceIndex: 1 },
      { type: 'addConnection', source: 'Native Gemini Error', target: 'Unit Done Counters' },
      {
        type: 'updateNodeParameters',
        nodeName: 'Upsert voc_response',
        parameters: {
          options: {
            queryReplacement:
              "={{ $json.unit.source_response_id }},={{ $json.unit.client_id }},={{ $json.unit.analytical_cycle_code }},={{ $json.unit.score }},={{ $json.unit.nps_category }},={{ $json.unit.question_key }},={{ $json.unit.question_text }},={{ $json.unit.answer_text }},={{ $json.unit.answer_hash }},={{ $json.unit.submitted_at }},={{ $json.unit.source_updated_at }}",
          },
        },
      },
      {
        type: 'updateNodeParameters',
        nodeName: 'Merge voc_response_id',
        parameters: {
          mode: 'runOnceForEachItem',
          jsCode:
            "const v = $('Validate VoC Output').item.json; return { json: { unit: { ...v.unit, voc_response_id: $json.voc_response_id }, classify: v.classify } };",
        },
      },
      {
        type: 'setWorkflowMetadata',
        description: 'VoC: BASE QV (Banco Cadu) → Prepare → Gemini nativo n8n → Business Data. Trilha Vercel HTTP desativada (nodes preservados).',
      },
      { type: 'setNodeSettings', nodeName: 'Gemini VoC Classify', settings: { onError: 'continueErrorOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 } },
    ],
  };
  console.log(JSON.stringify(payload));
} else if (batch === 'batch5') {
  const payload = {
    ...baseOps(),
    versionName: 'Native Gemini hashes + prepare fix',
    operations: [
      {
        type: 'updateNodeParameters',
        nodeName: 'Prepare VoC Input',
        parameters: { jsCode: prepareVoCInputJsCode() },
      },
      {
        type: 'updateNodeParameters',
        nodeName: 'Validate VoC Output',
        parameters: { mode: 'runOnceForEachItem', jsCode: validateVoCOutputJsCode() },
      },
      {
        type: 'addNode',
        node: {
          name: 'Compute Voc Hashes',
          type: 'n8n-nodes-base.postgres',
          typeVersion: 2.7,
          position: [1848, 160],
          parameters: {
            operation: 'executeQuery',
            query:
              "SELECT encode(digest($1::text, 'sha256'), 'hex') AS input_hash, encode(digest($2::text, 'sha256'), 'hex') AS answer_hash;",
            options: {
              queryReplacement:
                "={{ $('Prepare VoC Input').item.json.hash_input_json }},={{ $('Prepare VoC Input').item.json.hash_answer_json }}",
            },
          },
          credentials: { postgres: { id: '4PpLgshHFesCFajW', name: 'Postgres - Business Data' } },
        },
      },
      {
        type: 'addNode',
        node: {
          name: 'Merge Voc Hashes',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [1908, 160],
          parameters: {
            mode: 'runOnceForEachItem',
            jsCode:
              "const prep = $('Prepare VoC Input').item.json; return { json: { ...prep, input_hash: $json.input_hash, answer_hash: $json.answer_hash } };",
          },
        },
      },
      { type: 'removeConnection', source: 'Prepare VoC Input', target: 'Check Native Idempotency' },
      { type: 'addConnection', source: 'Prepare VoC Input', target: 'Compute Voc Hashes' },
      { type: 'addConnection', source: 'Compute Voc Hashes', target: 'Merge Voc Hashes' },
      { type: 'addConnection', source: 'Merge Voc Hashes', target: 'Check Native Idempotency' },
      {
        type: 'updateNodeParameters',
        nodeName: 'Check Native Idempotency',
        parameters: {
          options: {
            queryReplacement:
              "={{ $('Merge Voc Hashes').item.json.source_response_id }},={{ $('Merge Voc Hashes').item.json.prompt_version }},={{ $('Merge Voc Hashes').item.json.classifier_version }}",
          },
        },
      },
      {
        type: 'updateNodeParameters',
        nodeName: 'Gemini VoC Classify',
        parameters: {
          messages: {
            values: [{ role: 'user', content: "={{ $('Merge Voc Hashes').item.json.gemini_user_json }}" }],
          },
        },
      },
    ],
  };
  console.log(JSON.stringify(payload));
} else if (batch === 'batch6') {
  const payload = {
    ...baseOps(),
    versionName: 'HTTP Gemini VoC classify path',
    operations: [
      { type: 'setNodeDisabled', nodeName: 'Gemini VoC Classify', disabled: true },
      { type: 'removeConnection', source: 'IF Needs Native Classify', target: 'Gemini VoC Classify', sourceIndex: 0 },
      { type: 'removeConnection', source: 'Gemini VoC Classify', target: 'Validate VoC Output' },
      { type: 'removeConnection', source: 'Gemini VoC Classify', target: 'Native Gemini Error', sourceIndex: 1 },
      {
        type: 'addNode',
        node: {
          name: 'Build Gemini HTTP Body',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [2320, 160],
          parameters: { mode: 'runOnceForEachItem', jsCode: buildGeminiHttpBodyJsCode() },
        },
      },
      {
        type: 'addNode',
        node: {
          name: 'HTTP Gemini VoC Classify',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.5,
          position: [2560, 160],
          parameters: {
            method: 'POST',
            url: GEMINI_HTTP_GENERATE_URL,
            authentication: 'predefinedCredentialType',
            nodeCredentialType: 'googlePalmApi',
            sendHeaders: true,
            headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
            sendBody: true,
            specifyBody: 'json',
            jsonBody: '={{ $json.gemini_http_body }}',
            options: { timeout: 60000, response: { response: { responseFormat: 'json' } } },
          },
          credentials: { googlePalmApi: GEMINI_PALM_CRED },
        },
      },
      { type: 'addConnection', source: 'IF Needs Native Classify', target: 'Build Gemini HTTP Body', sourceIndex: 0 },
      { type: 'addConnection', source: 'Build Gemini HTTP Body', target: 'HTTP Gemini VoC Classify' },
      { type: 'addConnection', source: 'HTTP Gemini VoC Classify', target: 'Validate VoC Output', sourceIndex: 0 },
      { type: 'addConnection', source: 'HTTP Gemini VoC Classify', target: 'Native Gemini Error', sourceIndex: 1 },
      {
        type: 'updateNodeParameters',
        nodeName: 'Native Gemini Error',
        parameters: { mode: 'runOnceForEachItem', jsCode: nativeGeminiErrorJsCode() },
      },
      {
        type: 'setNodeSettings',
        nodeName: 'HTTP Gemini VoC Classify',
        settings: {
          onError: 'continueErrorOutput',
          retryOnFail: true,
          maxTries: 3,
          waitBetweenTries: 5000,
        },
      },
      {
        type: 'setWorkflowMetadata',
        description:
          'VoC: BASE QV → Prepare → HTTP Gemini (generateContent) → Validate → Business Data. Node LangChain Gemini preservado desativado. Vercel HTTP desativado.',
      },
    ],
  };
  console.log(JSON.stringify(payload));
} else if (batch === 'batch7') {
  const payload = {
    ...baseOps(),
    versionName: 'HTTP Gemini auth via Code helper',
    operations: [
      { type: 'removeConnection', source: 'Build Gemini HTTP Body', target: 'HTTP Gemini VoC Classify' },
      { type: 'removeConnection', source: 'HTTP Gemini VoC Classify', target: 'Validate VoC Output' },
      { type: 'removeConnection', source: 'HTTP Gemini VoC Classify', target: 'Native Gemini Error', sourceIndex: 1 },
      { type: 'removeNode', nodeName: 'HTTP Gemini VoC Classify' },
      {
        type: 'addNode',
        node: {
          name: 'HTTP Gemini VoC Classify',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [2560, 160],
          parameters: { mode: 'runOnceForEachItem', jsCode: httpGeminiClassifyJsCode() },
          credentials: { googlePalmApi: GEMINI_PALM_CRED },
        },
      },
      { type: 'addConnection', source: 'Build Gemini HTTP Body', target: 'HTTP Gemini VoC Classify' },
      { type: 'addConnection', source: 'HTTP Gemini VoC Classify', target: 'Validate VoC Output', sourceIndex: 0 },
      { type: 'addConnection', source: 'HTTP Gemini VoC Classify', target: 'Native Gemini Error', sourceIndex: 1 },
      {
        type: 'updateNodeParameters',
        nodeName: 'Validate VoC Output',
        parameters: { mode: 'runOnceForEachItem', jsCode: validateVoCOutputJsCode() },
      },
      {
        type: 'setNodeSettings',
        nodeName: 'HTTP Gemini VoC Classify',
        settings: { onError: 'continueErrorOutput', retryOnFail: false },
      },
    ],
  };
  console.log(JSON.stringify(payload));
} else {
  console.error('Unknown batch', batch);
  process.exit(1);
}
