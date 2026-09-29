import { readJson } from '../data/file-store.mjs';
import { buildResponseTopicsRows } from './voc-classifier.mjs';
import { buildResponseTopicsRowsWithAiValence } from './voc-ai-classifier.mjs';
import { loadVocAiConfig } from './voc-ai-config.mjs';
import { buildTopicSummaryDocument } from './topic-summary.mjs';

/**
 * @param {Array<object>} responses
 * @param {Array<object>} cycles
 * @param {string} dataCutoff
 * @param {object} [opts]
 */
export async function buildVocArtifacts(responses, cycles, dataCutoff, opts = {}) {
  let externalImport = opts.externalImport ?? [];
  if (!externalImport.length && opts.loadExternalPath !== false) {
    externalImport = (await readJson('imports/voc_classifications.json', [])) ?? [];
    if (!Array.isArray(externalImport)) externalImport = [];
  }

  const aiConfig = loadVocAiConfig();
  const useGemini = opts.useGemini === true || aiConfig.useGeminiPrimary;

  let responseTopics;
  let vocAiStats = null;

  if (useGemini) {
    const aiResult = await buildResponseTopicsRowsWithAiValence(responses, {
      externalImport,
      skipNetwork: opts.skipNetwork,
      fetchFn: opts.fetchFn,
      geminiClient: opts.geminiClient,
      saveCache: opts.saveCache !== false,
    });
    responseTopics = aiResult.rows;
    vocAiStats = aiResult.stats;
  } else {
    responseTopics = buildResponseTopicsRows(responses, {
      externalImport,
      useRules: opts.useRules !== false,
    });
  }

  const topicSummary = buildTopicSummaryDocument(responseTopics, responses, cycles, dataCutoff);
  if (useGemini) {
    topicSummary.classification.voc_ai = {
      provider: aiConfig.provider,
      model: aiConfig.model,
      classifier_version: aiConfig.classifierVersion,
      prompt_version: aiConfig.promptVersion,
      stats: vocAiStats,
    };
  }

  return { responseTopics, topicSummary, vocAiStats };
}
