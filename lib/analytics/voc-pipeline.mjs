import { readJson } from '../data/file-store.mjs';
import { buildResponseTopicsRows } from './voc-classifier.mjs';
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

  const responseTopics = buildResponseTopicsRows(responses, {
    externalImport,
    useRules: opts.useRules !== false,
  });

  const topicSummary = buildTopicSummaryDocument(responseTopics, responses, cycles, dataCutoff);

  return { responseTopics, topicSummary };
}
