import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutiveDiagnosis } from '../lib/analytics/executive-diagnosis.mjs';
import { STABLE_NPS_THRESHOLD } from '../lib/analytics/executive-diagnosis-config.mjs';

const baseCycleSummary = {
  data_cutoff: '2026-01-01',
  cycles: [
    {
      cycle_code: 'C1',
      cycle_name: 'Ciclo 1',
      sequence: 1,
      nps: 70,
      valid_responses: 100,
      promoters: 70,
      passives: 20,
      detractors: 10,
      promoter_pct: 70,
      passive_pct: 20,
      detractor_pct: 10,
      eligible_clients: 120,
      response_rate: 0.5,
      status: 'closed',
    },
    {
      cycle_code: 'C2',
      cycle_name: 'Ciclo 2',
      sequence: 2,
      nps: 55,
      valid_responses: 90,
      promoters: 50,
      passives: 25,
      detractors: 15,
      promoter_pct: 55.5,
      passive_pct: 27.7,
      detractor_pct: 16.6,
      eligible_clients: 100,
      response_rate: 0.1,
      status: 'open',
      response_rate_quality: 'partial',
    },
  ],
};

describe('executive diagnosis overall', () => {
  it('direction worsened', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: null,
      migrationMatrixDoc: null,
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.equal(doc.headline.direction, 'worsened');
    assert.ok(doc.headline.text.includes('caiu'));
    assert.equal(doc.headline.delta_nps, -15);
  });

  it('direction stable within threshold', () => {
    const cycles = [
      { cycle_code: 'C1', sequence: 1, nps: 60, valid_responses: 10, cycle_name: 'A' },
      {
        cycle_code: 'C2',
        sequence: 2,
        nps: 60 + STABLE_NPS_THRESHOLD * 0.5,
        valid_responses: 10,
        cycle_name: 'B',
      },
    ];
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles,
      cycleSummaryDoc: { cycles },
      pairedCyclesDoc: null,
      migrationMatrixDoc: null,
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.equal(doc.headline.direction, 'stable');
  });
});

describe('paired confirmation vs divergence', () => {
  it('same direction message', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: {
        current_cycle: 'C2',
        paired_clients: 40,
        delta_nps_paired: -10,
        previous_nps_paired: 80,
        current_nps_paired: 70,
      },
      migrationMatrixDoc: { current_cycle: 'C2', cells: [] },
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.match(doc.paired.comparison_text, /mesmos clientes/i);
  });

  it('divergence message', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: {
        current_cycle: 'C2',
        paired_clients: 40,
        delta_nps_paired: 5,
      },
      migrationMatrixDoc: { current_cycle: 'C2', cells: [] },
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.match(doc.paired.comparison_text, /diferentes/i);
  });
});

describe('migration ranking', () => {
  it('top negative migration reading', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: { current_cycle: 'C2', paired_clients: 10 },
      migrationMatrixDoc: {
        current_cycle: 'C2',
        paired_clients: 10,
        cells: [
          { key: 'Promotor -> Neutro', count: 5, pct_of_origin: 10 },
          { key: 'Promotor -> Promotor', count: 3, pct_of_origin: 90 },
        ],
      },
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.equal(doc.movement.negative_migrations, 5);
    assert.ok(doc.movement.reading.includes('Promotor'));
  });
});

describe('EP attention small sample', () => {
  it('exclui EP só com small_sample', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: null,
      migrationMatrixDoc: null,
      epSummaryDoc: {
        entries: [
          {
            cycle_code: 'C2',
            ep_name: 'EP Pequeno',
            valid_responses: 2,
            nps: 50,
            ep_low_confidence_pct: 0,
            paired_clients: 0,
          },
        ],
      },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.equal(doc.eps.eps_attention.length, 0);
  });
});

describe('drivers missing graceful', () => {
  it('continua com mensagem', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: null,
      migrationMatrixDoc: null,
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.equal(doc.drivers.available, false);
    assert.ok(doc.executive_summary.length >= 1);
  });
});

describe('action counts', () => {
  it('priority follow up', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: null,
      migrationMatrixDoc: null,
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { entries: [] },
      driversSummaryDoc: null,
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: {
        entries: [
          { client_id: '1', cycle_code: 'C2', priority: 'Alta' },
          { client_id: '2', cycle_code: 'C2', priority: 'Média' },
          { client_id: '3', cycle_code: 'C2', priority: 'Aprendizado' },
        ],
      },
      actionTrackingDoc: { entries: [] },
      responses: [],
    });
    assert.equal(doc.actions.priority_follow_up, 2);
    assert.equal(doc.actions.pending, 3);
  });
});

describe('quality flags', () => {
  it('partial_cycle and low_response_rate', () => {
    const doc = buildExecutiveDiagnosis({
      cycleCode: 'C2',
      cycles: baseCycleSummary.cycles,
      cycleSummaryDoc: baseCycleSummary,
      pairedCyclesDoc: { current_cycle: 'C2', paired_clients: 10 },
      migrationMatrixDoc: null,
      epSummaryDoc: { entries: [] },
      topicSummaryDoc: { classification: { pct_reviewed: 0, pct_coverage: 90 } },
      driversSummaryDoc: { entries: [], average_feature_coverage: 0.3 },
      commentDriversDoc: [],
      csatSummaryDoc: { cycles: [] },
      actionQueueEnrichedDoc: { entries: [] },
      actionTrackingDoc: { entries: [] },
      csatLegacyReconciliation: { csat_rule_ambiguous: true },
      responses: [{ analytical_cycle_code: 'C2', ep_resolution_confidence: 'low' }],
    });
    assert.ok(doc.quality.flags.includes('partial_cycle'));
    assert.ok(doc.quality.flags.includes('low_response_rate'));
    assert.ok(doc.quality.flags.includes('small_paired_base'));
    assert.ok(doc.quality.flags.includes('csat_rule_ambiguous'));
  });
});
