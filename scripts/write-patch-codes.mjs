import fs from 'fs';
import {
  prepareVoCInputJsCode,
  validateVoCOutputJsCode,
  GEMINI_SYSTEM_INSTRUCTION,
} from './n8n-voc-native-gemini-nodes.mjs';

const payload = {
  workflowId: 'ENqJyEuulA0vzoI6',
  versionName: 'Native Gemini code nodes',
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
      type: 'updateNodeParameters',
      nodeName: 'Gemini VoC Classify',
      parameters: { options: { systemMessage: GEMINI_SYSTEM_INSTRUCTION, maxOutputTokens: 4096, temperature: 0.2 } },
    },
  ],
};

fs.writeFileSync(new URL('./patch-codes.json', import.meta.url), JSON.stringify(payload));
console.log('bytes', JSON.stringify(payload).length);
