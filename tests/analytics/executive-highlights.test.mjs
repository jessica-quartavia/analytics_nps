import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutiveHeadline, buildExecutiveHighlights } from '../../dashboard/js/data/executive-highlights.mjs';

test('buildExecutiveHeadline usa delta real', () => {
  const text = buildExecutiveHeadline({ nps: 64.1 }, { nps: 68.1 });
  assert.match(text, /64,1/);
  assert.match(text, /queda de 4,0 pontos/);
});

test('buildExecutiveHighlights limita a 3 insights', () => {
  const out = buildExecutiveHighlights({
    currentSummary: { nps: 60 },
    previousSummary: { nps: 70 },
    paired: { paired_clients: 94, delta_nps_paired: -10 },
    migrationMatrix: {
      paired_clients: 94,
      cells: [
        { key: 'Promotor -> Neutro', count: 12 },
        { key: 'Promotor -> Promotor', count: 80 },
      ],
    },
    diagnosisFallback: {
      movement: { available: true, worsened_clients: 13 },
      voc: {
        top_negative_topics: [{ topic: 'Tecnologia / plataforma', negative_pct: 15.4, pct_responses: 4.6 }],
      },
      eps: { eps_attention: [{ ep_name: 'A', n: 10, delta_nps_paired: -20 }] },
    },
  });
  assert.ok(out.headline);
  assert.ok(out.highlights.length <= 3);
});
