import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evolutionBucket,
  mechanismBucket,
  coverageQualityLabel,
  buildEvolutionGroupCounts,
  buildMechanismsAnalysis,
  buildEpChangeAnalysis,
  buildChurnAnalysis,
  buildResultadosMechanismsInsight,
  generateAutoInsights,
  inferChurnSourceComplete,
} from '../lib/analytics/nps-change-drivers.mjs';
import {
  buildBetweenCycleEvents,
  buildNpsClientMilestones,
  prepareSourceBundle,
} from '../lib/analytics/nps-milestones.mjs';
import { enrichBetweenEventsWithMilestoneRows } from '../lib/analytics/nps-milestones-stats.mjs';

describe('nps change drivers — grupos e quality', () => {
  it('evolution buckets', () => {
    assert.equal(evolutionBucket('Melhora'), 'Melhora');
    assert.equal(evolutionBucket('Queda severa'), 'Queda');
    assert.equal(evolutionBucket('Estável'), 'Estável');
  });

  it('mechanism buckets', () => {
    assert.equal(mechanismBucket(0), '0');
    assert.equal(mechanismBucket(2), '2+');
  });

  it('coverage gates', () => {
    assert.equal(coverageQualityLabel(85), 'good');
    assert.equal(coverageQualityLabel(60), 'partial');
    assert.equal(coverageQualityLabel(30), 'low');
  });

  it('evolution groups always show n', () => {
    const between = [
      { evolution_status: 'Melhora' },
      { evolution_status: 'Queda' },
      { evolution_status: 'Estável' },
    ];
    const { groups } = buildEvolutionGroupCounts(between);
    assert.equal(groups.Melhora.n, 1);
    assert.equal(groups.Queda.n, 1);
    assert.equal(groups.Estável.n, 1);
  });
});

describe('nps change drivers — enrich between cycles', () => {
  const responses = [
    {
      response_id: 'a',
      client_id: 'c1',
      analytical_cycle_code: 'CY1',
      submitted_at: '2026-09-20T12:00:00Z',
      score: 7,
      nps_category: 'Neutro',
      program: 'PHARUS',
      evolution_status: 'Queda',
      nps_migration: 'Promotor → Neutro',
    },
    {
      response_id: 'b',
      client_id: 'c1',
      analytical_cycle_code: 'CY0',
      submitted_at: '2026-07-01T12:00:00Z',
      score: 10,
      nps_category: 'Promotor',
      program: 'PHARUS',
    },
  ];
  const loaded = {
    'client_meetings.json': [
      { client_id: 'c1', start_time: '2026-08-01T10:00:00Z' },
      { client_id: 'c1', start_time: '2026-09-10T10:00:00Z' },
    ],
    'client_mecanismos.json': [{ client_id: 'c1', implemented_at: '2026-08-20T10:00:00Z' }],
    'clients.json': [{ id: 'c1' }],
  };

  it('meetings_between and mechanism_added', () => {
    const bundle = prepareSourceBundle(loaded);
    const { entries } = buildNpsClientMilestones(responses, bundle);
    let between = buildBetweenCycleEvents(entries, {
      current_cycle: 'CY1',
      paired_client_ids: ['c1'],
    });
    between = enrichBetweenEventsWithMilestoneRows(between, entries, bundle);
    assert.equal(between.length, 1);
    assert.equal(between[0].meetings_between, 2);
    assert.equal(between[0].mechanism_added_between_cycles, true);
    assert.equal(between[0].mechanisms_added_count, 1);
  });
});

describe('nps change drivers — hipóteses operacionais', () => {
  const base = [
    {
      current_score: 6,
      previous_score: 9,
      score_delta: -3,
      evolution_status: 'Queda',
      meetings_between: 0,
      days_since_last_meeting_current: 90,
      mechanisms_count_before_response: 0,
      mechanism_added_between_cycles: false,
      ep_changed: true,
      churn_requested_before_response: false,
    },
    {
      current_score: 9,
      previous_score: 7,
      score_delta: 2,
      evolution_status: 'Melhora',
      meetings_between: 4,
      days_since_last_meeting_current: 10,
      mechanisms_count_before_response: 2,
      mechanism_added_between_cycles: true,
      ep_changed: false,
      churn_requested_before_response: false,
    },
    {
      current_score: 8,
      previous_score: 8,
      score_delta: 0,
      evolution_status: 'Estável',
      meetings_between: 2,
      mechanisms_count_before_response: 1,
      mechanism_added_between_cycles: false,
      ep_changed: false,
      churn_requested_before_response: null,
    },
  ];

  it('mechanism_added and EP', () => {
    const mech = buildMechanismsAnalysis(base);
    assert.equal(mech.by_mechanism_count_before_response['2+'].n, 1);
    assert.ok(mech.H5_added_vs_improvement.n_a >= 1);
    const ep = buildEpChangeAnalysis(base);
    assert.equal(ep.changed_ep_between_cycles.true.n, 1);
    assert.equal(ep.changed_ep_between_cycles.false.n, 2);
  });

  it('churn partial when source incomplete', () => {
    const c = buildChurnAnalysis(base, false);
    assert.equal(c.quality, 'partial');
    assert.equal(c.show_managerial_conclusion, false);
  });

  it('churn complete gate', () => {
    assert.equal(inferChurnSourceComplete({ 'cancellations.json': 20 }), false);
    assert.equal(inferChurnSourceComplete({ 'cancellations.json': 50 }), true);
  });

  it('resultados negativo × mecanismos', () => {
    const milestones = [
      { client_id: 'c1', analytical_cycle_code: 'CY1', score: 5, mechanisms_count_before_response: 0, response_id: 'r1' },
      { client_id: 'c2', analytical_cycle_code: 'CY1', score: 9, mechanisms_count_before_response: 2, response_id: 'r2' },
    ];
    const topics = [
      { response_id: 'r1', topic: 'Resultados', valence: 'Negativa', analytical_cycle_code: 'CY1', client_id: 'c1' },
    ];
    const byId = new Map([['r1', { response_id: 'r1' }], ['r2', { response_id: 'r2' }]]);
    const insight = buildResultadosMechanismsInsight(milestones, topics, byId, 'CY1');
    assert.equal(insight.resultados_negative.n, 1);
    assert.equal(insight.others.n, 1);
    assert.equal(insight.resultados_negative.median_mechanisms, 0);
  });

  it('auto insights respect quality', () => {
    const doc = {
      coverage: { fields: { mechanisms_before_response: { quality: 'good' } } },
      mechanisms: {
        by_mechanism_count_before_response: {
          '2+': { n: 20, nps: 40 },
          '0': { n: 20, nps: 10 },
        },
      },
      meetings: { tests: {} },
    };
    const ins = generateAutoInsights(doc);
    assert.ok(ins.some((i) => i.text.includes('2+ mecanismos')));
  });
});
