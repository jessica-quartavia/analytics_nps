import { classifyCommentWithRules, classifyFromExternal } from './voc-classifier.mjs';
import { buildVocValenceUnits } from './voc-ai-segments.mjs';
import { loadVocAiConfig, createEmptyGeminiRunStats, bumpFallbackReason } from './voc-ai-config.mjs';
import { createGeminiValenceClient } from './voc-gemini-client.mjs';
import { validateGeminiClassificationResponse } from './voc-ai-validate.mjs';
import { applySemanticReviewFlags } from './voc-semantic-validate.mjs';
import {
  loadVocAiCache,
  saveVocAiCache,
  vocAiCacheKey,
  getCachedClassification,
  setCachedClassification,
} from './voc-ai-cache.mjs';
import { VOC_CLASSIFIER_VERSION } from './voc-config.mjs';

const LOW_CONFIDENCE_THRESHOLD = 0.65;

function rulesFallbackRows(response, mentions, meta) {
  const classifiedAt = meta.classifiedAt ?? new Date().toISOString();
  return mentions.map((m) => ({
    response_id: response.response_id,
    client_id: response.client_id ?? null,
    analytical_cycle_code: response.analytical_cycle_code,
    topic: m.topic,
    valence: m.valence,
    confidence: Math.round((m.confidence ?? 0.68) * 1000) / 1000,
    classifier_source: 'rules_v2_fallback',
    classifier_version: VOC_CLASSIFIER_VERSION,
    classification_source: 'rules_v2_fallback',
    ai_provider: null,
    ai_model: null,
    evidence: null,
    valence_reason: m.valence_reason ?? null,
    classified_at: classifiedAt,
    needs_human_review: (m.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD,
    fallback_reason: meta.fallbackReason ?? null,
    reviewed: false,
  }));
}

function recordFallback(stats, reason, count = 1) {
  if (!stats) return;
  stats.fallback += count;
  bumpFallbackReason(stats, reason);
}

function geminiRows(response, classifications, config, classifiedAt) {
  return classifications.map((c) => ({
    response_id: response.response_id,
    client_id: response.client_id ?? null,
    analytical_cycle_code: response.analytical_cycle_code,
    topic: c.theme,
    valence: c.valence,
    confidence: c.confidence,
    classifier_source: 'gemini',
    classifier_version: config.classifierVersion,
    classification_source: 'gemini',
    prompt_version: config.promptVersion,
    ai_provider: config.provider,
    ai_model: config.model,
    evidence: c.evidence,
    valence_reason: c.reason ?? c.valence_reason,
    classified_at: classifiedAt,
    needs_human_review: Boolean(c.needs_human_review) || c.confidence < LOW_CONFIDENCE_THRESHOLD,
    semantic_conflict: c.semantic_conflict ?? false,
    reviewed: false,
  }));
}

/**
 * @param {object} response
 * @param {object} ctx
 */
export async function classifyResponseValenceWithAi(response, ctx) {
  const config = ctx.config ?? loadVocAiConfig();
  const stats = ctx.stats;
  const classifiedAt = new Date().toISOString();
  const comment = response.comment?.trim();
  if (!comment) return [];

  const { units, skippedNoAdditional } = buildVocValenceUnits(comment);
  if (!units.length) {
    if (skippedNoAdditional && stats) stats.no_additional_comment += 1;
    return [];
  }

  const allowedThemes = new Set(units.flatMap((u) => u.candidate_themes));
  const cachePayload = {
    score: response.score ?? null,
    nps_category: response.nps_category ?? null,
    segments: units.map((u) => ({
      question: u.question,
      answer: u.answer,
      candidate_themes: u.candidate_themes,
    })),
  };
  const cacheKey = vocAiCacheKey(cachePayload, {
    promptVersion: config.promptVersion,
    model: config.model,
    classifierVersion: config.classifierVersion,
  });

  if (ctx.cacheDoc) {
    const hit = getCachedClassification(ctx.cacheDoc, cacheKey);
    if (hit?.classifications) {
      if (stats) {
        stats.cache_hits += 1;
        stats.successful_gemini += 1;
      }
      const rows = geminiRows(response, hit.classifications, config, hit.classified_at ?? classifiedAt);
      if (ctx.collectMeta && rows[0]) {
        ctx.collectMeta.last = { source: 'cache', latency_ms: 0, model: config.model };
      }
      return rows;
    }
  }

  const rulesMentions = classifyCommentWithRules(comment, { npsScore: response.score ?? null });

  if (ctx.skipNetwork || !config.geminiConfigured) {
    const reason = !config.hasApiKey ? 'missing_key' : !config.hasModel ? 'model_not_available' : 'gemini_disabled';
    recordFallback(stats, reason, rulesMentions.length || 1);
    return rulesFallbackRows(response, rulesMentions, { classifiedAt, fallbackReason: reason });
  }

  if (!config.useGemini && !ctx.geminiClient) {
    recordFallback(stats, 'gemini_disabled', rulesMentions.length || 1);
    return rulesFallbackRows(response, rulesMentions, { classifiedAt, fallbackReason: 'gemini_disabled' });
  }

  if (stats) stats.attempted_gemini += 1;

  const client = ctx.geminiClient ?? createGeminiValenceClient(config, { fetchFn: ctx.fetchFn });
  const apiResult = await client.classifyValence(cachePayload);

  if (ctx.collectMeta) {
    ctx.collectMeta.last = {
      source: 'api',
      latency_ms: apiResult.latency_ms,
      http_status: apiResult.http_status,
      model: config.model,
      errorCode: apiResult.errorCode,
    };
  }

  if (!apiResult.ok) {
    if (stats) {
      stats.failed += 1;
      if (apiResult.errorCode === 'GEMINI_RATE_LIMIT') stats.rate_limit += 1;
      if (apiResult.errorCode === 'GEMINI_TIMEOUT') stats.timeout += 1;
      if (apiResult.errorCode === 'GEMINI_INVALID_OUTPUT' || apiResult.fallback_reason === 'invalid_json') {
        stats.invalid_json += 1;
      }
    }
    const reason = apiResult.fallback_reason ?? 'unknown';
    if (ctx.collectMeta) {
      ctx.collectMeta.last = {
        ...ctx.collectMeta.last,
        errorCode: apiResult.errorCode,
        parse_error: apiResult.parse_error,
        model_text_preview: apiResult.model_text_preview,
      };
    }
    recordFallback(stats, reason, rulesMentions.length || 1);
    return rulesFallbackRows(response, rulesMentions, { classifiedAt, fallbackReason: reason });
  }

  const validated = validateGeminiClassificationResponse(apiResult.data, allowedThemes);
  if (!validated.ok) {
    if (stats) {
      stats.invalid_json += 1;
      stats.failed += 1;
      stats.schema_invalid = (stats.schema_invalid ?? 0) + 1;
    }
    if (ctx.collectMeta) {
      ctx.collectMeta.last = {
        ...ctx.collectMeta.last,
        errorCode: 'GEMINI_SCHEMA_INVALID',
        schema_error: validated.error,
      };
    }
    recordFallback(stats, 'schema_invalid', rulesMentions.length || 1);
    return rulesFallbackRows(response, rulesMentions, { classifiedAt, fallbackReason: 'schema_invalid' });
  }

  if (validated.classifications.length === 0) {
    if (ctx.cacheDoc) {
      setCachedClassification(ctx.cacheDoc, cacheKey, {
        classifications: [],
        classified_at: classifiedAt,
        no_additional_comment: validated.no_additional_comment,
      });
    }
    return [];
  }

  const segmentContext = units[0]
    ? { question: units.map((u) => u.question).join(' '), answer: units.map((u) => u.answer).join(' ') }
    : {};
  const reviewed = applySemanticReviewFlags(validated.classifications, segmentContext);

  if (ctx.cacheDoc) {
    setCachedClassification(ctx.cacheDoc, cacheKey, {
      classifications: reviewed,
      classified_at: classifiedAt,
    });
  }
  if (stats) {
    stats.gemini_calls += 1;
    stats.successful_gemini += 1;
  }

  return geminiRows(response, reviewed, config, classifiedAt);
}

/** Primeira resposta com unidades VoC classificáveis. */
export function findFirstClassifiableVocResponse(responses) {
  for (const r of responses ?? []) {
    if (!r.comment?.trim()) continue;
    const { units } = buildVocValenceUnits(r.comment);
    if (units.length) return r;
  }
  return null;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * @param {Array<object>} responses
 * @param {object} [opts]
 */
export async function buildResponseTopicsRowsWithAiValence(responses, opts = {}) {
  const config = opts.config ?? loadVocAiConfig();
  const externalImport = opts.externalImport ?? [];
  const externalByResponseId = new Map();
  for (const block of externalImport) {
    if (block?.response_id && Array.isArray(block.topics)) {
      externalByResponseId.set(block.response_id, block.topics);
    }
  }

  const cacheDoc = opts.cacheDoc ?? loadVocAiCache(opts.cachePath);
  const stats = opts.stats ?? createEmptyGeminiRunStats();

  /** @type {Array<object>} */
  const out = [];
  /** @type {Array<object>} */
  const toProcess = [];

  for (const r of responses ?? []) {
    const comment = r.comment?.trim();
    if (!comment) continue;
    const external = classifyFromExternal(r.response_id, externalByResponseId);
    if (external.length) {
      for (const row of external) {
        out.push({
          response_id: r.response_id,
          client_id: r.client_id ?? null,
          analytical_cycle_code: r.analytical_cycle_code,
          topic: row.topic,
          valence: row.valence,
          confidence: row.confidence,
          classifier_source: 'human_review',
          classifier_version: row.classification_source ?? 'external_import',
          classification_source: row.classification_source,
          ai_provider: null,
          ai_model: null,
          evidence: null,
          valence_reason: null,
          classified_at: null,
          needs_human_review: false,
          reviewed: Boolean(row.reviewed),
        });
      }
      continue;
    }
    toProcess.push(r);
  }

  const ctxBase = {
    config,
    cacheDoc,
    stats,
    skipNetwork: opts.skipNetwork ?? !config.geminiConfigured,
    fetchFn: opts.fetchFn,
    geminiClient: opts.geminiClient,
  };

  const batchResults = await mapPool(toProcess, config.concurrency, async (r) =>
    classifyResponseValenceWithAi(r, ctxBase),
  );

  for (const rows of batchResults) {
    out.push(...rows);
  }

  if (opts.saveCache !== false) {
    saveVocAiCache(cacheDoc, opts.cachePath);
  }

  return { rows: out, stats, cacheDoc, config };
}
