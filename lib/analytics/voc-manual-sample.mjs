import { hasCommentText } from './voc-classifier.mjs';

function shuffleDeterministic(arr, seed = 42) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Amostra estratificada para revisão manual VoC (não altera classificação).
 */
export function buildVocManualSample(params) {
  const {
    responses = [],
    responseTopics = [],
    cycleCode,
    targets = { positiva: 20, neutra: 20, negativa: 20, multitema: 20, unclassified: 19 },
  } = params;

  const cycleResponses = responses.filter(
    (r) => r.analytical_cycle_code === cycleCode && hasCommentText(r.comment),
  );
  const topicsByResponse = new Map();
  for (const t of responseTopics.filter((x) => x.analytical_cycle_code === cycleCode)) {
    if (!topicsByResponse.has(t.response_id)) topicsByResponse.set(t.response_id, []);
    topicsByResponse.get(t.response_id).push(t);
  }

  const withTopics = [];
  const unclassified = [];
  for (const r of cycleResponses) {
    const topics = topicsByResponse.get(r.response_id) ?? [];
    if (!topics.length) {
      unclassified.push(r);
      continue;
    }
    const valences = new Set(topics.map((t) => t.valence));
    const isMulti = topics.length > 1 || valences.size > 1;
    withTopics.push({
      response: r,
      topics,
      isMulti,
      primaryValence: predominantValence(topics),
    });
  }

  const pick = (pool, n, seed) =>
    shuffleDeterministic(pool, seed).slice(0, n).map((item) => toSampleRow(item));

  const positiva = withTopics.filter((x) => x.primaryValence === 'Positiva' && !x.isMulti);
  const neutra = withTopics.filter((x) => x.primaryValence === 'Neutra' && !x.isMulti);
  const negativa = withTopics.filter((x) => x.primaryValence === 'Negativa' && !x.isMulti);
  const multitema = withTopics.filter((x) => x.isMulti);

  const sample = {
    generated_at: new Date().toISOString(),
    cycle_code: cycleCode,
    methodology: {
      classifier: 'rules_v1',
      purpose: 'Revisão manual de precisão aparente — não edita classificação.',
      targets,
    },
    strata: {
      positiva: pick(positiva, targets.positiva, 11),
      neutra: pick(neutra, targets.neutra, 22),
      negativa: pick(negativa, targets.negativa, 33),
      multitema: pick(multitema, targets.multitema, 44),
      unclassified: pick(
        unclassified.map((r) => ({ response: r, topics: [], isMulti: false })),
        targets.unclassified,
        55,
      ),
    },
  };

  sample.totals = {
    positiva: sample.strata.positiva.length,
    neutra: sample.strata.neutra.length,
    negativa: sample.strata.negativa.length,
    multitema: sample.strata.multitema.length,
    unclassified: sample.strata.unclassified.length,
    total:
      sample.strata.positiva.length +
      sample.strata.neutra.length +
      sample.strata.negativa.length +
      sample.strata.multitema.length +
      sample.strata.unclassified.length,
  };

  sample.review_fields = [
    'manual_valence_ok',
    'manual_topics_ok',
    'error_type',
    'reviewer_notes',
  ];

  return sample;
}

function predominantValence(topics) {
  const counts = { Positiva: 0, Neutra: 0, Negativa: 0 };
  for (const t of topics) {
    counts[t.valence] = (counts[t.valence] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function toSampleRow(item) {
  const r = item.response;
  const topics = item.topics ?? [];
  return {
    response_id: r.response_id,
    client_id: r.client_id,
    score: r.score,
    nps_category: r.nps_category,
    comment_excerpt: (r.comment ?? '').slice(0, 500),
    topics: topics.map((t) => ({
      topic: t.topic,
      valence: t.valence,
      confidence: t.confidence,
      classification_source: t.classification_source,
    })),
    manual_review: {
      manual_valence_ok: null,
      manual_topics_ok: null,
      error_type: null,
      reviewer_notes: '',
    },
  };
}
