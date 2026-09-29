import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVocCommentRows,
  hasVocData,
  computeVocPageKpis,
  getTopicOptions,
} from '../../dashboard/js/data/store-core.mjs';

describe('voc store-core', () => {
  const responses = [
    {
      response_id: 'r1',
      client_name: 'Ana',
      ep_name: 'EP1',
      score: 9,
      nps_category: 'Promotor',
      analytical_cycle_code: 'C1',
      analytical_cycle_name: 'Set',
      comment: 'Ótimo atendimento',
    },
  ];
  const topics = [
    {
      response_id: 'r1',
      analytical_cycle_code: 'C1',
      topic: 'Atendimento / relacionamento',
      valence: 'Positiva',
    },
  ];

  it('hasVocData', () => {
    assert.equal(hasVocData({ entries: [] }, []), false);
    assert.equal(hasVocData({ entries: [{}] }, topics), true);
  });

  it('topic filter', () => {
    const all = buildVocCommentRows(responses, topics, 'C1', {});
    assert.equal(all.length, 1);
    const none = buildVocCommentRows(responses, topics, 'C1', { topic: 'Outro' });
    assert.equal(none.length, 0);
  });

  it('valence filter', () => {
    const neg = buildVocCommentRows(responses, topics, 'C1', { valence: 'Negativa' });
    assert.equal(neg.length, 0);
  });

  it('unclassified: sem topics => hasVocData false', () => {
    assert.equal(hasVocData({ entries: [] }, null), false);
  });

  it('getTopicOptions', () => {
    const opts = getTopicOptions(topics, 'C1');
    assert.deepEqual(opts, ['Atendimento / relacionamento']);
  });

  it('computeVocPageKpis', () => {
    const k = computeVocPageKpis(responses, topics, 'C1');
    assert.equal(k.commentsAnalyzed, 1);
    assert.equal(k.commentsWithTopic, 1);
  });
});
