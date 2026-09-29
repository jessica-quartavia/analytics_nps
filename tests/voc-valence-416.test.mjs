import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCommentWithRules } from '../lib/analytics/voc-classifier.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FERNANDO_SET = `Qual o principal motivo da sua nota?: A diversidade de implantações para alavancagem patrimonial e o ganho de tempo que proporciona ao investidor.

Qual a principal razão para a sua nota 9 ou 10? O que mais te agradou em sua experiência?: Com certeza a confiança. Como já disse a diversificação de ativos e a facilidade de contato com meu acessor.

O que te faria continuar com a gente por mais 5 anos sem hesitar?: Ter retornos consistentes.

Você gostaria de adicionar algum outro comentário sobre a sua experiência com a QuartaVia?: Nunca tinha pensado em participar de um grupo numa empresa de implementação patrimonial tendo clareza nas minhas ações.`;

const NEVER_CLARITY =
  'Nunca tinha pensado em participar de um grupo numa empresa de implementação patrimonial tendo clareza nas minhas ações.';

describe('VoC valence 4.16 — rules_v2', () => {
  it('Fernando Set/2026 — confiança, atendimento e clareza não negativos', () => {
    const m = classifyCommentWithRules(FERNANDO_SET, { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Confiança')?.valence, 'Positiva');
    assert.equal(m.find((x) => x.topic === 'Atendimento / relacionamento')?.valence, 'Positiva');
    const clareza = m.find((x) => x.topic === 'Clareza / comunicação');
    assert.ok(clareza?.valence === 'Positiva' || clareza?.valence === 'Neutra');
    assert.notEqual(clareza?.valence, 'Negativa');
    const res = m.find((x) => x.topic === 'Resultados');
    assert.ok(res?.valence === 'Neutra' || res?.valence === 'Positiva');
    assert.notEqual(res?.valence, 'Negativa');
  });

  it('caso nunca tinha pensado — clareza positiva', () => {
    const m = classifyCommentWithRules(NEVER_CLARITY, { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Clareza / comunicação')?.valence, 'Positiva');
  });

  it('A) atendimento excelente + resultados negativos separados', () => {
    const m = classifyCommentWithRules('Atendimento excelente, mas ainda não vi resultado.', { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Atendimento / relacionamento')?.valence, 'Positiva');
    assert.equal(m.find((x) => x.topic === 'Resultados')?.valence, 'Negativa');
  });

  it('B) satisfeito com assessor — EP positiva', () => {
    const m = classifyCommentWithRules('Estou muito satisfeito com meu assessor.', { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Engenheiro Patrimonial')?.valence, 'Positiva');
  });

  it('C) ainda não vi retorno prometido — resultados negativa', () => {
    const m = classifyCommentWithRules('Ainda não vi o retorno prometido.', { npsScore: 8 });
    assert.equal(m.find((x) => x.topic === 'Resultados')?.valence, 'Negativa');
  });

  it('D) ter retornos consistentes — neutra prospectiva', () => {
    const m = classifyCommentWithRules(
      'O que te faria continuar com a gente por mais 5 anos sem hesitar?: Ter retornos consistentes.',
      { npsScore: 10 },
    );
    const res = m.find((x) => x.topic === 'Resultados' || x.topic === 'Expectativa');
    assert.ok(res);
    assert.equal(res.valence, 'Neutra');
  });

  it('E) nunca + hoje tenho clareza — clareza positiva', () => {
    const m = classifyCommentWithRules('Nunca tinha pensado nisso e hoje tenho clareza.', { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Clareza / comunicação')?.valence, 'Positiva');
  });

  it('F) não tenho clareza — clareza negativa', () => {
    const m = classifyCommentWithRules('Não tenho clareza dos próximos passos.', { npsScore: 7 });
    assert.equal(m.find((x) => x.topic === 'Clareza / comunicação')?.valence, 'Negativa');
  });

  it('valence_reason presente nas menções', () => {
    const m = classifyCommentWithRules(FERNANDO_SET, { npsScore: 10 });
    assert.ok(m.every((x) => x.valence_reason));
  });

  it('artefato voc_false_negative_audit.json gerável', () => {
    const p = join(root, 'data/quality/voc_false_negative_audit.json');
    if (existsSync(p)) {
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      assert.equal(doc.classifier_candidate, 'rules_v2');
      assert.ok(doc.simulation?.transitions);
    }
  });
});
