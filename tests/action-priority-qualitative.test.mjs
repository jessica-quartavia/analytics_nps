import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCommentWithRules,
  buildResponseTopicsRows,
} from '../lib/analytics/voc-classifier.mjs';
import {
  computeActionPriority,
  computeInvestigateReasons,
  computeQualitativeSignal,
} from '../lib/analytics/action-priority.mjs';

const LENIS_COMMENT = `"Atenção dispensada"
"O atendimento sempre que precisamos"
"Se houvesse a garantia dos resultados prometidos."`;

describe('rules_v1 — valência por cláusula (Lenis)', () => {
  it('atendimento positivo; resultados/expectativa negativos', () => {
    const mentions = classifyCommentWithRules(LENIS_COMMENT);
    const atend = mentions.find((m) => m.topic === 'Atendimento / relacionamento');
    const res = mentions.find((m) => m.topic === 'Resultados');
    const exp = mentions.find((m) => m.topic === 'Expectativa');
    assert.ok(atend, 'deve detectar atendimento');
    assert.equal(atend.valence, 'Positiva');
    assert.ok(res || exp, 'deve detectar resultados ou expectativa');
    const negTopics = mentions.filter((m) => m.valence === 'Negativa');
    assert.ok(negTopics.length >= 1);
    assert.ok(!negTopics.some((m) => m.topic === 'Atendimento / relacionamento'));
  });

  it('buildResponseTopicsRows preserva valências', () => {
    const rows = buildResponseTopicsRows([
      {
        response_id: 'lenis',
        client_id: 'c-lenis',
        analytical_cycle_code: 'C',
        comment: LENIS_COMMENT,
      },
    ]);
    const atend = rows.find((r) => r.topic === 'Atendimento / relacionamento');
    assert.equal(atend?.valence, 'Positiva');
  });
});

describe('Investigar vs sinal qualitativo', () => {
  const stablePromotorRow = {
    nps_migration: 'Promotor → Promotor',
    evolution_status: 'Estável',
    nps_category: 'Promotor',
    previous_category: 'Promotor',
    score_delta: 0,
    current_score: 10,
    promotor_consistent: true,
    is_paired_with_previous: true,
    comment: LENIS_COMMENT,
  };

  it('10→10 + temas negativos sem sinal adicional não gera Investigar', () => {
    const ctx = { negative_topics_count: 2, topics_count: 3, topics: [] };
    const inv = computeInvestigateReasons(stablePromotorRow, ctx);
    assert.equal(
      inv.filter((r) => r.includes('temas negativos')).length,
      0,
    );
  });

  it('Promotor estável + tema negativo = qualitative_signal', () => {
    const q = computeQualitativeSignal(stablePromotorRow, { negative_topics_count: 2 });
    assert.equal(q.qualitative_signal, true);
  });

  it('prioridade Aprendizado com sinal qualitativo separado', () => {
    const result = computeActionPriority(stablePromotorRow, {
      negative_topics_count: 2,
      topics_count: 3,
      topics: [],
    });
    assert.equal(result.priority, 'Aprendizado');
    assert.equal(result.qualitative_signal, true);
    assert.ok(result.priority_reasons.some((r) => r.includes('Promotor consistente')));
    assert.ok(result.other_signals.length >= 1);
    assert.ok(!result.priority_reasons.some((r) => r.includes('Investigar')));
  });

  it('Promotor→Neutro + temas negativos pode ser Média', () => {
    const { priority } = computeActionPriority(
      {
        nps_migration: 'Promotor → Neutro',
        evolution_status: 'Queda',
        nps_category: 'Neutro',
        previous_category: 'Promotor',
        score_delta: -2,
        current_score: 8,
      },
      { negative_topics_count: 2, topics_count: 2, topics: [] },
    );
    assert.equal(priority, 'Média');
  });

  it('Promotor→Detrator continua Alta', () => {
    const { priority } = computeActionPriority(
      {
        nps_migration: 'Promotor → Detrator',
        evolution_status: 'Queda severa',
        nps_category: 'Detrator',
        previous_category: 'Promotor',
        score_delta: -5,
      },
      { negative_topics_count: 0, topics_count: 0 },
    );
    assert.equal(priority, 'Alta');
  });

  it('Promotor + ≥2 temas negativos + delta <= -2 continua Investigar', () => {
    const { priority, priority_reasons } = computeActionPriority(
      {
        nps_migration: 'Promotor → Promotor',
        evolution_status: 'Estável',
        nps_category: 'Promotor',
        previous_category: 'Promotor',
        score_delta: -3,
        current_score: 9,
      },
      { negative_topics_count: 2, topics_count: 2, topics: [] },
    );
    assert.equal(priority, 'Investigar');
    assert.ok(priority_reasons.some((r) => r.includes('temas negativos')));
  });
});
