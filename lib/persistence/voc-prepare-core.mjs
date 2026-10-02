import { randomUUID } from 'node:crypto';
import { loadAnalyticalCycleConfig, buildAnalyticalResponsesFromSource } from '../pipeline/analytical-response-builder.mjs';
import { buildAnswerHash, buildVocInputHash } from './voc-input-hash.mjs';
import { questionKey, expandResponseToWorkItems } from './voc-source-units.mjs';
import { VOC_GEMINI_CLASSIFIER_VERSION, VOC_GEMINI_PROMPT_VERSION } from '../analytics/voc-ai-config.mjs';
import { loadVocAiConfig } from '../analytics/voc-ai-config.mjs';

/**
 * Normalização oficial (sem banco) a partir de linha BASE QV + cliente + ciclos.
 * @param {object} body
 */
export function prepareVocUnitsFromSource(body) {
  const sourceRow = body.source_row ?? body;
  const client = body.client;
  if (!sourceRow?.id || !client?.id) {
    return { ok: false, code: 'INVALID_INPUT', error: 'source_row.id e client são obrigatórios' };
  }

  const sourceCycles = body.source_cycles ?? [];
  const analyticalConfig = body.analytical_config_path
    ? loadAnalyticalCycleConfig(body.analytical_config_path)
    : loadAnalyticalCycleConfig();
  const clientsMap = new Map([[client.id, client]]);
  const journeyMap = new Map();
  if (body.journey_stage != null) {
    journeyMap.set(client.id, body.journey_stage);
  }
  const transferMap = new Map([[client.id, body.transfer_logs ?? []]]);
  const epNameToId = body.ep_name_to_id ? new Map(Object.entries(body.ep_name_to_id)) : new Map();

  const built = buildAnalyticalResponsesFromSource({
    sourceRows: [sourceRow],
    analyticalConfig,
    sourceCyclesFromDb: sourceCycles,
    clientsMap,
    journeyMap,
    transferMap,
    epNameToId,
    refreshRunId: randomUUID(),
  });

  const response = built.responses[0];
  if (!response) {
    return {
      ok: true,
      skipped: true,
      reason: 'analytical_cycle_unresolved_or_invalid',
      units: [],
    };
  }

  const updated = {
    ...response,
    updated_at: sourceRow.created_at ?? sourceRow.submitted_at ?? response.submitted_at,
  };

  const config = loadVocAiConfig(body.env ?? process.env);
  const classifierVersion = body.classifier_version ?? VOC_GEMINI_CLASSIFIER_VERSION;
  const promptVersion = body.prompt_version ?? VOC_GEMINI_PROMPT_VERSION;
  const model = config.model;

  const workItems = expandResponseToWorkItems(updated);
  const units = workItems.map((item) => ({
    source_response_id: item.source_response_id,
    client_id: item.client_id,
    analytical_cycle_code: item.analytical_cycle_code,
    score: item.score,
    nps_category: item.nps_category,
    question_key: item.question_key,
    question_text: item.question_text,
    answer_text: item.answer_text,
    answer_hash: item.answer_hash,
    submitted_at: item.submitted_at,
    source_updated_at: item.source_updated_at,
    candidate_themes: item.unit.candidate_themes,
    input_hash: buildVocInputHash({
      question: item.question_text,
      answer: item.answer_text,
      candidateThemes: item.unit.candidate_themes,
      promptVersion,
      model,
      classifierVersion,
    }),
    classify_payload: {
      response_id: item.source_response_id,
      score: item.score,
      nps_category: item.nps_category,
      question: item.question_text,
      answer: item.answer_text,
      candidate_themes: item.unit.candidate_themes,
    },
  }));

  return {
    ok: true,
    response_id: updated.response_id,
    analytical_cycle_code: updated.analytical_cycle_code,
    nps_category: updated.nps_category,
    score: updated.score,
    units,
    meta: {
      duplicate_dropped: built.duplicate_count,
      prompt_version: promptVersion,
      classifier_version: classifierVersion,
      model,
    },
  };
}

export { questionKey, buildAnswerHash, buildVocInputHash };
