import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTopicSummaryDocument } from './topic-summary.mjs';
import { classificationPublishRank, pickBestClassificationRow } from './voc-publish-priority.mjs';

export function mapDbClassificationToTopicRow(pgRow, responseMeta) {
  const isHuman = pgRow.classifier_source === 'human_review';
  return {
    response_id: pgRow.source_response_id,
    client_id: responseMeta?.client_id ?? pgRow.client_id ?? null,
    analytical_cycle_code: responseMeta?.analytical_cycle_code ?? pgRow.analytical_cycle_code ?? null,
    topic: pgRow.topic,
    valence: pgRow.valence,
    confidence: pgRow.confidence,
    classification_source: pgRow.classifier_source,
    classifier_source: pgRow.classifier_source,
    valence_reason: pgRow.valence_reason,
    evidence: pgRow.evidence,
    ai_provider: pgRow.ai_provider ?? null,
    ai_model: pgRow.ai_model ?? null,
    prompt_version: pgRow.prompt_version ?? null,
    classifier_version: pgRow.classifier_version ?? null,
    needs_human_review: pgRow.needs_human_review ?? false,
    semantic_conflict: pgRow.semantic_conflict ?? false,
    score_text_conflict: pgRow.score_text_conflict ?? false,
    reviewed: isHuman,
    reviewed_by_email: pgRow.reviewed_by_email ?? null,
    reviewed_by_name: pgRow.reviewed_by_name ?? null,
    reviewed_at: pgRow.reviewed_at ?? null,
    review_notes: pgRow.review_notes ?? null,
    previous_topics_snapshot: pgRow.previous_topics_snapshot ?? null,
    supersedes_classifier_source: pgRow.supersedes_classifier_source ?? null,
    classified_at: pgRow.classified_at ?? null,
  };
}

/**
 * Revisão manual substitui todos os temas da resposta no bundle publicado.
 * @param {Array<object>} existingTopics
 * @param {Array<object>} manualTopicRows — de manualReviewToTopicRows
 */
export function mergeManualReviewsIntoResponseTopics(existingTopics, manualTopicRows, opts = {}) {
  const only = opts.onlyResponseIds;
  const byResponse = new Map();
  for (const row of manualTopicRows) {
    if (only && !only.has(row.response_id)) continue;
    if (!byResponse.has(row.response_id)) byResponse.set(row.response_id, []);
    byResponse.get(row.response_id).push(row);
  }
  if (!byResponse.size) return existingTopics;

  const kept = existingTopics.filter((t) => !byResponse.has(t.response_id));
  const merged = [...kept];
  for (const rows of byResponse.values()) {
    for (const r of rows) {
      merged.push(mapDbClassificationToTopicRow(r, { client_id: r.client_id, analytical_cycle_code: r.analytical_cycle_code }));
    }
  }
  merged.sort((a, b) => {
    const c = (a.response_id ?? '').localeCompare(b.response_id ?? '');
    if (c) return c;
    return (a.topic ?? '').localeCompare(b.topic ?? '', 'pt-BR');
  });
  return merged;
}

/**
 * Mescla linhas Postgres (prioridade v3/gemini) sobre bundle rules_v2 local.
 * @param {Array<object>} existingTopics
 * @param {Array<object>} dbRows — voc_classifications ou voc_current
 * @param {Map<string, object>} responseById
 * @param {{ onlyResponseIds?: Set<string> }} opts
 */
export function mergePostgresIntoResponseTopics(existingTopics, dbRows, responseById, opts = {}) {
  const only = opts.onlyResponseIds;
  const dbByKey = new Map();
  for (const row of dbRows) {
    if (only && !only.has(row.source_response_id)) continue;
    const key = `${row.source_response_id}\0${row.topic}`;
    const prev = dbByKey.get(key);
    const candidates = prev ? [prev, row] : [row];
    dbByKey.set(key, pickBestClassificationRow(candidates));
  }

  const kept = existingTopics.filter((t) => {
    if (!only?.has(t.response_id)) return true;
    const key = `${t.response_id}\0${t.topic}`;
    return !dbByKey.has(key);
  });

  const merged = [...kept];
  for (const pgRow of dbByKey.values()) {
    const meta = responseById.get(pgRow.source_response_id);
    merged.push(mapDbClassificationToTopicRow(pgRow, meta));
  }

  merged.sort((a, b) => {
    const c = (a.response_id ?? '').localeCompare(b.response_id ?? '');
    if (c) return c;
    return (a.topic ?? '').localeCompare(b.topic ?? '', 'pt-BR');
  });

  return merged;
}

export function summarizeClassificationSources(rows) {
  const bySource = {};
  for (const r of rows) {
    const s = r.classifier_source ?? r.classification_source ?? 'sem_metadata';
    bySource[s] = (bySource[s] ?? 0) + 1;
  }
  return bySource;
}

export function mergeIntoVocAllPeriods(vocAllDoc, responseTopics, onlyResponseIds = null) {
  const existing = Array.isArray(vocAllDoc?.topics) ? vocAllDoc.topics : [];
  const only = onlyResponseIds;
  const incoming = only ? responseTopics.filter((t) => only.has(t.response_id)) : responseTopics;
  if (!incoming.length) return vocAllDoc;

  const kept = existing.filter((t) => !only || !only.has(t.response_id));
  const mergedTopics = [...kept, ...incoming];
  mergedTopics.sort((a, b) => {
    const c = (a.response_id ?? '').localeCompare(b.response_id ?? '');
    if (c) return c;
    return (a.topic ?? '').localeCompare(b.topic ?? '', 'pt-BR');
  });
  return { ...vocAllDoc, topics: mergedTopics };
}

export function writeMaterializedVocBundle(root, { responseTopics, responses, cycles, dataCutoff, onlyResponseIds = null }) {
  const topicSummary = buildTopicSummaryDocument(responseTopics, responses, cycles, dataCutoff);
  topicSummary.classification.sources = summarizeClassificationSources(responseTopics);
  topicSummary.classification.materialized_from = 'postgres_merge';
  topicSummary.classification.materialized_at = new Date().toISOString();

  writeFileSync(join(root, 'data/processed/response_topics.json'), JSON.stringify(responseTopics, null, 2) + '\n', 'utf8');
  writeFileSync(join(root, 'data/processed/topic_summary.json'), JSON.stringify(topicSummary, null, 2) + '\n', 'utf8');

  let vocAllSources = null;
  try {
    const vocAllPath = join(root, 'data/processed/voc_all_periods.json');
    const vocAllDoc = JSON.parse(readFileSync(vocAllPath, 'utf8'));
    const vocAllMerged = mergeIntoVocAllPeriods(vocAllDoc, responseTopics, onlyResponseIds);
    writeFileSync(vocAllPath, JSON.stringify(vocAllMerged, null, 2) + '\n', 'utf8');
    vocAllSources = summarizeClassificationSources(vocAllMerged.topics ?? []);
  } catch {
    /* voc_all_periods optional */
  }

  return {
    topicSummary,
    sources: topicSummary.classification.sources,
    voc_all_sources: vocAllSources,
  };
}

export function loadJsonFile(root, rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}
