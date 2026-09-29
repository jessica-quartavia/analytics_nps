import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInvestigateReasons,
  computeActionPriority,
} from '../lib/analytics/action-priority.mjs';
import { buildActionQueueEnriched } from '../lib/analytics/action-queue-enriched.mjs';
import {
  mergeActionTracking,
  upsertTrackingEntry,
} from '../lib/analytics/action-tracking.mjs';
import {
  filterActionPlanRows,
  mergeActionTrackingIntoQueue,
  computeActionPlanKpis,
  buildActionPlanCsv,
} from '../dashboard/js/data/store-core.mjs';

describe('action priority investigate', () => {
  it('Investigar para CSAT alto e NPS Detrator', () => {
    const reasons = computeInvestigateReasons(
      { nps_category: 'Detrator', score_delta: -1 },
      { has_csat: true, latest_csat_score: 5, csat_average: 4.5 },
    );
    assert.ok(reasons.length >= 1);
    const { priority } = computeActionPriority(
      {
        nps_migration: 'Neutro → Detrator',
        evolution_status: 'Queda',
        nps_category: 'Detrator',
        previous_category: 'Neutro',
      },
      { has_csat: true, latest_csat_score: 5 },
    );
    assert.equal(priority, 'Média');
  });

  it('Investigar-only entra na fila', () => {
    const { priority, reasons } = computeActionPriority(
      {
        nps_migration: 'Promotor → Promotor',
        evolution_status: 'Estável',
        nps_category: 'Promotor',
        previous_category: 'Promotor',
        score_delta: 5,
        is_paired_with_previous: true,
        comment: '',
      },
      { topics_count: 0 },
    );
    assert.equal(priority, 'Investigar');
    assert.ok(reasons.some((r) => r.includes('sem comentário')));
  });
});

describe('action tracking merge', () => {
  it('status default Novo', () => {
    const merged = mergeActionTrackingIntoQueue(
      [{ client_id: 'a', cycle_code: 'C1', priority: 'Alta' }],
      { entries: [] },
    );
    assert.equal(merged[0].status, 'Novo');
    assert.equal(merged[0].owner, '');
  });

  it('merge por client_id + cycle_code', () => {
    const merged = mergeActionTracking(
      [{ client_id: 'a', cycle_code: 'C1' }],
      {
        entries: [
          {
            client_id: 'a',
            cycle_code: 'C1',
            status: 'Contatado',
            owner: 'EP',
            action_notes: 'Ligou',
            updated_at: '2026-01-01',
          },
        ],
      },
    );
    assert.equal(merged[0].status, 'Contatado');
    assert.equal(merged[0].owner, 'EP');
    assert.equal(merged[0].action_notes, 'Ligou');
  });

  it('upsert não apaga outras entradas', () => {
    const doc = upsertTrackingEntry(
      {
        entries: [{ client_id: 'x', cycle_code: 'C', status: 'Novo', owner: '', action_notes: '' }],
      },
      { client_id: 'y', cycle_code: 'C', status: 'Em análise', owner: 'A' },
    );
    assert.equal(doc.entries.length, 2);
  });
});

describe('action plan filters', () => {
  const rows = [
    {
      client_id: '1',
      priority: 'Alta',
      ep_name: 'EP A',
      current_category: 'Detrator',
      nps_migration: 'Promotor → Detrator',
      has_csat: true,
      topics: [{ topic: 'Resultados', valence: 'Negativa' }],
      status: 'Novo',
      client_name: 'Ana',
    },
    {
      client_id: '2',
      priority: 'Aprendizado',
      ep_name: 'EP B',
      current_category: 'Promotor',
      nps_migration: 'Promotor → Promotor',
      has_csat: false,
      topics: [],
      status: 'Resolvido',
      client_name: 'Bob',
    },
  ];

  it('priority filter', () => {
    const out = filterActionPlanRows(rows, { priority: 'Alta' }, {});
    assert.equal(out.length, 1);
    assert.equal(out[0].client_id, '1');
  });

  it('EP filter', () => {
    const out = filterActionPlanRows(rows, { ep: 'EP B' }, {});
    assert.equal(out.length, 1);
  });

  it('topic filter', () => {
    const out = filterActionPlanRows(rows, { topic: 'Resultados' }, {});
    assert.equal(out.length, 1);
  });

  it('has csat filter', () => {
    const out = filterActionPlanRows(rows, { hasCsat: 'no' }, {});
    assert.equal(out.length, 1);
    assert.equal(out[0].client_id, '2');
  });

  it('export csv respeita recorte', () => {
    const csv = buildActionPlanCsv(filterActionPlanRows(rows, { priority: 'Alta' }, {}));
    assert.match(csv, /Ana/);
    assert.doesNotMatch(csv, /Bob/);
  });

  it('learning cases counted', () => {
    const k = computeActionPlanKpis(rows);
    assert.equal(k.Aprendizado, 1);
    assert.equal(k.pending, 1);
  });
});

describe('action queue enriched', () => {
  it('priority_rules e recommended_action_type', () => {
    const doc = buildActionQueueEnriched({
      actionQueue: [
        {
          priority: 'Alta',
          reason: 'Promotor → Detrator',
          client_id: 'c1',
          client_name: 'Test',
          ep_name: 'EP',
          previous_score: 10,
          current_score: 5,
          score_delta: -5,
          previous_category: 'Promotor',
          current_category: 'Detrator',
          nps_migration: 'Promotor → Detrator',
          comment: 'x',
          cycle_code: 'C',
          response_id: 'r1',
        },
      ],
      responses: [
        {
          response_id: 'r1',
          client_id: 'c1',
          evolution_status: 'Queda severa',
          critical_flag: true,
          ep_resolution_confidence: 'low',
        },
      ],
      responseTopics: [],
      clientSatisfactionDoc: { entries: [] },
      cycleCode: 'C',
    });
    assert.equal(doc.entries[0].recommended_action_type, 'Contato imediato');
    assert.ok(doc.entries[0].priority_rules.some((r) => r.includes('Promotor')));
    assert.ok(doc.entries[0].quality_notes.some((n) => n.includes('EP')));
  });
});

describe('tracking survives refresh semantics', () => {
  it('regeneração analítica preserva tracking ao remerge', () => {
    const analytical = [
      { client_id: 'a', cycle_code: 'C', priority: 'Média', reason: 'Queda' },
    ];
    const tracking = {
      entries: [
        {
          client_id: 'a',
          cycle_code: 'C',
          status: 'Contatado',
          owner: 'Maria',
          action_notes: 'ok',
          updated_at: 't',
        },
      ],
    };
    const regen = mergeActionTrackingIntoQueue(analytical, tracking);
    assert.equal(regen[0].status, 'Contatado');
    assert.equal(regen[0].owner, 'Maria');
  });
});
