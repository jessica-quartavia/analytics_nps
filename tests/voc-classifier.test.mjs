import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCommentWithRules,
  inferLocalValence,
  buildResponseTopicsRows,
} from '../lib/analytics/voc-classifier.mjs';

describe('voc-classifier', () => {
  it('multi-label: EP positivo e plataforma negativa', () => {
    const comment = 'Meu EP é ótimo, mas a plataforma é lenta.';
    const mentions = classifyCommentWithRules(comment);
    const topics = new Set(mentions.map((m) => m.topic));
    assert.ok(topics.has('Engenheiro Patrimonial'));
    assert.ok(topics.has('Tecnologia / plataforma'));
    const ep = mentions.find((m) => m.topic === 'Engenheiro Patrimonial');
    const tech = mentions.find((m) => m.topic === 'Tecnologia / plataforma');
    assert.equal(ep.valence, 'Positiva');
    assert.equal(tech.valence, 'Negativa');
  });

  it('valence local no comentário inteiro', () => {
    const text = 'xxx plataforma yyy';
    const v = inferLocalValence('a plataforma é lenta e ruim', text.indexOf('plataforma'));
    assert.equal(v, 'Negativa');
  });

  it('buildResponseTopicsRows com response_id rastreável', () => {
    const rows = buildResponseTopicsRows([
      {
        response_id: 'r1',
        client_id: 'c1',
        analytical_cycle_code: 'C1',
        comment: 'Confio no engenheiro patrimonial e no plano.',
      },
    ]);
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((r) => r.response_id === 'r1'));
    assert.equal(rows[0].classification_source, 'rules_v2');
  });

  it('comentário vazio não gera linhas', () => {
    const rows = buildResponseTopicsRows([
      { response_id: 'r2', analytical_cycle_code: 'C1', comment: '   ' },
    ]);
    assert.equal(rows.length, 0);
  });
});
