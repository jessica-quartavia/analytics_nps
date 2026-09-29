import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionQueueCalibration,
  buildCalibrationRecommendation,
  computeInvestigateReasonsProposed,
} from '../lib/analytics/action-queue-calibration.mjs';
import { computeInvestigateReasons } from '../lib/analytics/action-priority.mjs';

describe('investigate directional rule', () => {
  it('atual dispara em melhora |Δ|>=4', () => {
    const reasons = computeInvestigateReasons(
      {
        nps_category: 'Promotor',
        score_delta: 5,
        is_paired_with_previous: true,
        comment: '',
      },
      { topics_count: 0 },
    );
    assert.ok(reasons.some((r) => r.includes('Mudança relevante')));
  });

  it('proposta não dispara em melhora', () => {
    const reasons = computeInvestigateReasonsProposed(
      {
        nps_category: 'Promotor',
        score_delta: 5,
        is_paired_with_previous: true,
        comment: '',
      },
      { topics_count: 0 },
    );
    assert.equal(
      reasons.filter((r) => r.includes('Queda relevante') || r.includes('Mudança relevante')).length,
      0,
    );
  });

  it('proposta dispara em queda <= -4', () => {
    const reasons = computeInvestigateReasonsProposed(
      {
        nps_category: 'Neutro',
        score_delta: -4,
        is_paired_with_previous: true,
        comment: '',
      },
      { topics_count: 0 },
    );
    assert.ok(reasons.some((r) => r.includes('Queda relevante')));
  });
});

describe('calibration report', () => {
  const enriched = {
    meta: { cycle_code: 'C' },
    entries: [
      {
        client_id: '1',
        cycle_code: 'C',
        priority: 'Investigar',
        priority_rules: ['Mudança relevante de nota sem comentário ou temas classificados'],
        score_delta: 5,
        current_category: 'Promotor',
        previous_score: 5,
        current_score: 10,
        comment: '',
        topics: [],
      },
      {
        client_id: '2',
        cycle_code: 'C',
        priority: 'Alta',
        priority_rules: ['Promotor → Detrator'],
        score_delta: -5,
        current_category: 'Detrator',
        previous_score: 10,
        current_score: 5,
        comment: 'x',
        topics: [],
      },
    ],
  };

  it('gera decomposição e matriz', () => {
    const cal = buildActionQueueCalibration({ actionQueueEnrichedDoc: enriched, cycleCode: 'C' });
    assert.equal(cal.summary.investigate_count, 1);
    assert.ok(cal.priority_transition_matrix.Investigar);
    assert.ok(cal.rule_distribution.length >= 1);
  });

  it('recomendação não usa meta de tamanho', () => {
    const cal = buildActionQueueCalibration({ actionQueueEnrichedDoc: enriched, cycleCode: 'C' });
    const rec = buildCalibrationRecommendation(cal);
    assert.equal(rec.not_based_on_queue_size_target, true);
  });
});
