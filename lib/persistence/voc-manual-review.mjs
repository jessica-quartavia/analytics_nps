import { createHash } from 'node:crypto';
import { OFFICIAL_TOPICS } from '../analytics/voc-config.mjs';
import { VOC_GEMINI_CLASSIFIER_VERSION } from '../analytics/voc-ai-config.mjs';
import { analyticsFrom } from './voc-supabase-store.mjs';
import { throwSupabaseError } from './voc-supabase-errors.mjs';

const HUMAN_CLASSIFIER_VERSION = 'human_review_v1';

function hashHumanReviewInput(responseId, topic, reviewId) {
  return createHash('sha256').update(`human_review:${responseId}:${topic}:${reviewId}`, 'utf8').digest('hex');
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchActiveManualReviews(supabase, { responseIds = null } = {}) {
  let q = analyticsFrom(supabase, 'voc_manual_reviews').select('*').eq('active', true).eq('status', 'reviewed');
  if (responseIds?.length) q = q.in('response_id', responseIds);
  const { data, error } = await q;
  if (error) throwSupabaseError('voc_manual_reviews select', error);
  return data ?? [];
}

/**
 * Expande revisão ativa em linhas compatíveis com response_topics / voc_current.
 * @param {object} review
 */
export function manualReviewToTopicRows(review, responseMeta = {}) {
  const topics = Array.isArray(review.reviewed_topics) ? review.reviewed_topics : [];
  return topics
    .filter((t) => t?.topic && OFFICIAL_TOPICS.includes(t.topic))
    .map((t) => ({
      source_response_id: review.response_id,
      response_id: review.response_id,
      client_id: review.client_id ?? responseMeta?.client_id ?? null,
      analytical_cycle_code: review.analytical_cycle_code ?? responseMeta?.analytical_cycle_code ?? null,
      topic: t.topic,
      valence: t.valence,
      confidence: 1,
      evidence: t.evidence ?? null,
      valence_reason: 'human_review',
      classifier_source: 'human_review',
      classification_source: 'human_review',
      ai_provider: null,
      ai_model: null,
      prompt_version: null,
      classifier_version: HUMAN_CLASSIFIER_VERSION,
      needs_human_review: false,
      reviewed: true,
      reviewed_by_email: review.reviewer_email,
      reviewed_by_name: review.reviewer_name ?? null,
      reviewed_at: review.reviewed_at,
      review_notes: review.review_notes ?? null,
      supersedes_classifier_source: review.supersedes_classifier_source ?? null,
      previous_topics_snapshot: review.previous_topics_snapshot ?? null,
      manual_review_id: review.id,
    }));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function saveManualReview(supabase, payload) {
  const responseId = String(payload.response_id ?? '').trim();
  const reviewerEmail = String(payload.reviewer_email ?? '').trim();
  if (!responseId || !reviewerEmail) {
    throw new Error('response_id e reviewer_email são obrigatórios');
  }

  const reviewedTopics = (payload.reviewed_topics ?? []).filter((t) => t?.topic && t?.valence);
  if (!reviewedTopics.length) {
    throw new Error('reviewed_topics não pode ser vazio');
  }

  for (const t of reviewedTopics) {
    if (!OFFICIAL_TOPICS.includes(t.topic)) {
      throw new Error(`Tema inválido: ${t.topic}`);
    }
    if (!['Positiva', 'Neutra', 'Negativa'].includes(t.valence)) {
      throw new Error(`Valência inválida: ${t.valence}`);
    }
  }

  const { data: prevActive, error: prevErr } = await analyticsFrom(supabase, 'voc_manual_reviews')
    .select('id, reviewed_topics, supersedes_classifier_source')
    .eq('response_id', responseId)
    .eq('active', true);
  if (prevErr) throwSupabaseError('voc_manual_reviews select active', prevErr);

  if (prevActive?.length) {
    const ids = prevActive.map((r) => r.id);
    const { error: deactErr } = await analyticsFrom(supabase, 'voc_manual_reviews')
      .update({ active: false, status: 'superseded' })
      .in('id', ids);
    if (deactErr) throwSupabaseError('voc_manual_reviews deactivate', deactErr);
  }

  const snapshot = payload.previous_topics_snapshot ?? payload.original_topics ?? null;

  const insertRow = {
      response_id: responseId,
      client_id: payload.client_id ?? null,
      analytical_cycle_code: payload.analytical_cycle_code ?? null,
      reviewer_email: reviewerEmail,
      reviewer_name: payload.reviewer_name ?? null,
      review_notes: payload.review_notes ?? null,
      reviewed_topics: reviewedTopics,
      supersedes_classifier_source: payload.supersedes_classifier_source ?? null,
      previous_topics_snapshot: snapshot,
      status: 'reviewed',
      active: true,
    };
  if (payload.reviewer_user_id) {
    insertRow.reviewer_user_id = payload.reviewer_user_id;
  }

  const { data: inserted, error: insErr } = await analyticsFrom(supabase, 'voc_manual_reviews')
    .insert(insertRow)
    .select('*')
    .single();
  if (insErr) throwSupabaseError('voc_manual_reviews insert', insErr);

  await ensureAggregateVocResponse(supabase, {
    source_response_id: responseId,
    client_id: payload.client_id ?? null,
    analytical_cycle_code: payload.analytical_cycle_code ?? null,
    score: payload.score ?? null,
    nps_category: payload.nps_category ?? null,
  });

  const vocResponseId = await getAggregateVocResponseId(supabase, responseId);

  for (const t of reviewedTopics) {
    const inputHash = hashHumanReviewInput(responseId, t.topic, inserted.id);
    const { error: clsErr } = await analyticsFrom(supabase, 'voc_classifications').upsert(
      {
        voc_response_id: vocResponseId,
        source_response_id: responseId,
        topic: t.topic,
        valence: t.valence,
        confidence: 1,
        evidence: t.evidence ?? payload.review_notes ?? 'Revisão manual',
        valence_reason: 'human_review',
        classifier_source: 'human_review',
        ai_provider: null,
        ai_model: null,
        prompt_version: null,
        classifier_version: HUMAN_CLASSIFIER_VERSION,
        input_hash: inputHash,
        needs_human_review: false,
        fallback_reason: null,
      },
      { onConflict: 'input_hash,topic,classifier_version' },
    );
    if (clsErr) throwSupabaseError('voc_classifications human_review upsert', clsErr);
  }

  return inserted;
}

async function ensureAggregateVocResponse(supabase, row) {
  const questionKey = '__manual_review_aggregate__';
  const answerHash = createHash('sha256').update(`${row.source_response_id}:manual_review`, 'utf8').digest('hex');
  const { error } = await analyticsFrom(supabase, 'voc_responses').upsert(
    {
      source_response_id: row.source_response_id,
      client_id: row.client_id,
      analytical_cycle_code: row.analytical_cycle_code,
      score: row.score,
      nps_category: row.nps_category,
      question_key: questionKey,
      question_text: 'Revisão manual agregada',
      answer_text: '',
      answer_hash: answerHash,
      source_updated_at: new Date().toISOString(),
    },
    { onConflict: 'source_response_id,question_key' },
  );
  if (error) throwSupabaseError('voc_responses aggregate upsert', error);
}

async function getAggregateVocResponseId(supabase, sourceResponseId) {
  const { data, error } = await analyticsFrom(supabase, 'voc_responses')
    .select('id')
    .eq('source_response_id', sourceResponseId)
    .eq('question_key', '__manual_review_aggregate__')
    .maybeSingle();
  if (error) throwSupabaseError('voc_responses aggregate select', error);
  if (!data?.id) throw new Error('voc_response agregado não encontrado após upsert');
  return data.id;
}

export { HUMAN_CLASSIFIER_VERSION };
