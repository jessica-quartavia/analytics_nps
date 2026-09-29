import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVocCommentRows,
  buildVocGroupedCommentRows,
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

  it('agrupa múltiplos temas por cliente', () => {
    const multiTopics = [
      ...topics,
      {
        response_id: 'r1',
        analytical_cycle_code: 'C1',
        topic: 'Resultados',
        valence: 'Neutra',
      },
      {
        response_id: 'r1',
        analytical_cycle_code: 'C1',
        topic: 'Agilidade',
        valence: 'Neutra',
      },
    ];
    const flat = buildVocCommentRows(responses, multiTopics, 'C1', {});
    assert.equal(flat.length, 3);
    const grouped = buildVocGroupedCommentRows(responses, multiTopics, 'C1', {});
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].topics.length, 3);
    const ids = new Set(grouped.map((g) => g.response_id));
    assert.equal(ids.size, grouped.length);
  });

  it('filtro tema+valência mantém uma linha por cliente', () => {
    const multiTopics = [
      {
        response_id: 'r1',
        analytical_cycle_code: 'C1',
        topic: 'Resultados',
        valence: 'Negativa',
      },
      {
        response_id: 'r1',
        analytical_cycle_code: 'C1',
        topic: 'Agilidade',
        valence: 'Neutra',
      },
    ];
    const grouped = buildVocGroupedCommentRows(responses, multiTopics, 'C1', {
      topic: 'Resultados',
      valence: 'Negativa',
    });
    assert.equal(grouped.length, 1);
    assert.ok(grouped[0].topics.some((t) => t.topic === 'Agilidade'));
  });
});
