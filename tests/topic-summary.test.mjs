import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopicSummaryDocument,
  countMultitopicResponses,
} from '../lib/analytics/topic-summary.mjs';
import { buildResponseTopicsRows } from '../lib/analytics/voc-classifier.mjs';

describe('topic-summary', () => {
  it('mentions vs responses_with_topic', () => {
    const responses = [
      {
        response_id: 'a',
        client_id: '1',
        analytical_cycle_code: 'C1',
        score: 9,
        comment: 'Confio no engenheiro e na plataforma digital.',
      },
    ];
    const topics = buildResponseTopicsRows(responses);
    const doc = buildTopicSummaryDocument(topics, responses, [{ cycle_code: 'C1', sequence: 1 }], '2026-01-01');
    const ep = doc.entries.find((e) => e.topic === 'Engenheiro Patrimonial');
    const tech = doc.entries.find((e) => e.topic === 'Tecnologia / plataforma');
    assert.ok(ep.responses_with_topic <= 1);
    assert.ok(tech.responses_with_topic <= 1);
    const totalMentions = doc.entries.reduce((s, e) => s + e.mentions, 0);
    assert.equal(totalMentions, topics.length);
    assert.ok(totalMentions >= 2);
  });

  it('NPS por tema usa só quem mencionou', () => {
    const responses = [
      {
        response_id: 'a',
        client_id: '1',
        analytical_cycle_code: 'C1',
        score: 10,
        comment: 'Excelente atendimento',
      },
      {
        response_id: 'b',
        client_id: '2',
        analytical_cycle_code: 'C1',
        score: 3,
        comment: 'Sem comentário relevante xyz',
      },
    ];
    const topics = buildResponseTopicsRows(responses);
    const doc = buildTopicSummaryDocument(topics, responses, [{ cycle_code: 'C1', sequence: 1 }], '2026-01-01');
    const att = doc.entries.find((e) => e.topic === 'Atendimento / relacionamento');
    if (att && att.responses_with_topic > 0) {
      assert.equal(att.nps, 100);
    }
  });

  it('countMultitopicResponses', () => {
    const rows = [
      { response_id: 'x', topic: 'A' },
      { response_id: 'x', topic: 'B' },
      { response_id: 'y', topic: 'A' },
    ];
    const { count } = countMultitopicResponses(rows);
    assert.equal(count, 1);
  });
});
