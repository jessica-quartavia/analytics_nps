import { classifyNpsScore, isValidScore } from './nps.mjs';
import { OFFICIAL_TOPICS, VOC_TAXONOMY_VERSION } from './voc-config.mjs';
import { hasCommentText } from './voc-classifier.mjs';
import { classifyTopicEvolution } from './topic-evolution.mjs';

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

/**
 * @param {Array<object>} responseTopics
 * @param {Array<object>} responses
 * @param {Array<{ cycle_code: string, sequence?: number }>} cycles
 * @param {string} dataCutoff
 */
export function buildTopicSummaryDocument(responseTopics, responses, cycles, dataCutoff) {
  const sortedCycles = [...(cycles ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const cycleCodes = sortedCycles.map((c) => c.cycle_code);

  const responseById = new Map();
  for (const r of responses ?? []) {
    responseById.set(r.response_id, r);
  }

  const commentsByCycle = new Map();
  for (const r of responses ?? []) {
    if (!r.analytical_cycle_code || !hasCommentText(r.comment)) continue;
    if (!commentsByCycle.has(r.analytical_cycle_code)) {
      commentsByCycle.set(r.analytical_cycle_code, new Set());
    }
    commentsByCycle.get(r.analytical_cycle_code).add(r.response_id);
  }

  /** @type {Array<object>} */
  const entries = [];

  for (const cycleCode of cycleCodes) {
    const commentIds = commentsByCycle.get(cycleCode) ?? new Set();
    const commentsTotal = commentIds.size;

    const topicsInCycle = responseTopics.filter((t) => t.analytical_cycle_code === cycleCode);

    for (const topic of OFFICIAL_TOPICS) {
      const rows = topicsInCycle.filter((t) => t.topic === topic);
      const mentions = rows.length;
      const responseIds = new Set(rows.map((r) => r.response_id));
      const responsesWithTopic = responseIds.size;

      let positive = 0;
      let neutral = 0;
      let negative = 0;
      for (const row of rows) {
        if (row.valence === 'Positiva') positive++;
        else if (row.valence === 'Negativa') negative++;
        else neutral++;
      }

      const scores = [];
      let promoters = 0;
      let passives = 0;
      let detractors = 0;
      for (const rid of responseIds) {
        const resp = responseById.get(rid);
        if (!resp || !isValidScore(resp.score)) continue;
        scores.push(resp.score);
        const cat = classifyNpsScore(resp.score);
        if (cat === 'Promotor') promoters++;
        else if (cat === 'Neutro') passives++;
        else detractors++;
      }

      const npsValid = promoters + passives + detractors;
      const nps = npsValid ? ((promoters - detractors) / npsValid) * 100 : null;

      entries.push({
        analytical_cycle_code: cycleCode,
        topic,
        mentions,
        responses_with_topic: responsesWithTopic,
        pct_responses: pct(responsesWithTopic, commentsTotal),
        positive,
        neutral,
        negative,
        positive_pct: pct(positive, mentions),
        neutral_pct: pct(neutral, mentions),
        negative_pct: pct(negative, mentions),
        average_score: average(scores),
        nps,
        promoters,
        passives: passives,
        detractors,
        _comments_total: commentsTotal,
      });
    }
  }

  for (let i = 0; i < cycleCodes.length; i++) {
    const code = cycleCodes[i];
    const prevCode = i > 0 ? cycleCodes[i - 1] : null;
    for (const topic of OFFICIAL_TOPICS) {
      const cur = entries.find((e) => e.analytical_cycle_code === code && e.topic === topic);
      const prev = prevCode
        ? entries.find((e) => e.analytical_cycle_code === prevCode && e.topic === topic)
        : null;
      if (!cur) continue;
      cur.previous_mentions = prev?.mentions ?? null;
      cur.previous_pct_responses = prev?.pct_responses ?? null;
      cur.mention_delta =
        prev != null ? (cur.mentions ?? 0) - (prev.mentions ?? 0) : null;
      cur.mention_pct_delta =
        prev != null && prev.pct_responses != null
          ? cur.pct_responses - prev.pct_responses
          : null;
      cur.evolution_signal = classifyTopicEvolution(cur, prev);
    }
  }

  const stripped = entries.map(({ _comments_total, ...rest }) => rest);

  const classification = buildClassificationMeta(responseTopics, responses);

  return {
    data_cutoff: dataCutoff,
    taxonomy_version: VOC_TAXONOMY_VERSION,
    classification,
    entries: stripped,
  };
}

export function buildClassificationMeta(responseTopics, responses) {
  const withComment = (responses ?? []).filter((r) => hasCommentText(r.comment));
  const commentIds = new Set(withComment.map((r) => r.response_id));
  const classifiedIds = new Set(responseTopics.map((t) => t.response_id));
  const withTopic = [...commentIds].filter((id) => classifiedIds.has(id)).length;

  let confSum = 0;
  let reviewed = 0;
  const buckets = { high: 0, medium: 0, low: 0 };
  for (const t of responseTopics) {
    confSum += t.confidence ?? 0;
    if (t.reviewed) reviewed++;
    const c = t.confidence ?? 0;
    if (c >= 0.75) buckets.high++;
    else if (c >= 0.5) buckets.medium++;
    else buckets.low++;
  }

  const rows = responseTopics.length;
  const multi = countMultitopicResponses(responseTopics);

  return {
    comments_total: withComment.length,
    comments_with_text: withComment.length,
    comments_classified: withTopic,
    comments_with_topic: withTopic,
    pct_coverage: pct(withTopic, withComment.length),
    pct_reviewed: rows ? pct(reviewed, rows) : 0,
    confidence_mean: rows ? confSum / rows : null,
    confidence_buckets: buckets,
    topic_rows: rows,
    multitopic_responses: multi.count,
    pct_multitopic: pct(multi.count, withTopic),
    sources: summarizeSources(responseTopics),
  };
}

function summarizeSources(rows) {
  const map = {};
  for (const r of rows) {
    const s = r.classification_source ?? 'unknown';
    map[s] = (map[s] ?? 0) + 1;
  }
  return map;
}

export function countMultitopicResponses(responseTopics) {
  const byResponse = new Map();
  for (const t of responseTopics) {
    if (!byResponse.has(t.response_id)) byResponse.set(t.response_id, new Set());
    byResponse.get(t.response_id).add(t.topic);
  }
  let count = 0;
  for (const topics of byResponse.values()) {
    if (topics.size > 1) count++;
  }
  return { count, byResponse };
}

export function computeVocPageKpis(responseTopics, responses, cycleCode) {
  const cycleResponses = (responses ?? []).filter((r) => r.analytical_cycle_code === cycleCode);
  const analyzed = cycleResponses.filter((r) => hasCommentText(r.comment));
  const topicRows = responseTopics.filter((t) => t.analytical_cycle_code === cycleCode);
  const withTopicIds = new Set(topicRows.map((t) => t.response_id));

  const negativeCommentIds = new Set();
  const byResponseValence = new Map();
  for (const t of topicRows) {
    if (!byResponseValence.has(t.response_id)) byResponseValence.set(t.response_id, []);
    byResponseValence.get(t.response_id).push(t.valence);
  }
  for (const [rid, valences] of byResponseValence) {
    if (valences.includes('Negativa')) negativeCommentIds.add(rid);
  }

  const distinctTopics = new Set(topicRows.map((t) => t.topic));
  const multi = countMultitopicResponses(topicRows);

  return {
    commentsAnalyzed: analyzed.length,
    commentsWithTopic: [...withTopicIds].filter((id) => analyzed.some((r) => r.response_id === id)).length,
    distinctTopics: distinctTopics.size,
    pctNegativeComments: pct(negativeCommentIds.size, analyzed.length),
    pctMultitopic: pct(multi.count, withTopicIds.size),
  };
}
