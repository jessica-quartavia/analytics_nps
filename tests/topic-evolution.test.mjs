import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTopicEvolution } from '../lib/analytics/topic-evolution.mjs';

describe('topic-evolution', () => {
  it('pain_emerging com delta e valência negativa', () => {
    const cur = {
      responses_with_topic: 20,
      pct_responses: 8,
      mentions: 25,
      positive: 2,
      neutral: 3,
      negative: 20,
      negative_pct: 80,
    };
    const prev = {
      pct_responses: 3,
      mentions: 8,
      negative: 6,
    };
    assert.equal(classifyTopicEvolution(cur, prev), 'pain_emerging');
  });

  it('stable quando delta pequeno', () => {
    const cur = { responses_with_topic: 5, pct_responses: 5, mentions: 5, positive: 2, neutral: 2, negative: 1 };
    const prev = { pct_responses: 4.5, mentions: 4, negative: 1 };
    assert.equal(classifyTopicEvolution(cur, prev), 'stable');
  });
});
