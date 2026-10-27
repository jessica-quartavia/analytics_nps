import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPromotor5Estrelas,
  validNpsResponsesForClient,
  evaluatePromotor5EstrelasFunnel,
  computeUniverseAudit,
  buildPromotoresFiveEstrelasPack,
} from '../../lib/analytics/promotores-5-estrelas.mjs';

const cid = 'client-1';

test('Promotor 5 estrelas: 10→10 entra', () => {
  const rows = [
    { client_id: cid, score: 10, submitted_at: '2026-09-01', response_id: 'b' },
    { client_id: cid, score: 10, submitted_at: '2026-06-01', response_id: 'a' },
  ];
  assert.equal(isPromotor5Estrelas(validNpsResponsesForClient(rows, cid)), true);
});

test('Promotor 5 estrelas: 9→10 entra', () => {
  const rows = [
    { client_id: cid, score: 10, submitted_at: '2026-09-01', response_id: 'b' },
    { client_id: cid, score: 9, submitted_at: '2026-06-01', response_id: 'a' },
  ];
  assert.equal(isPromotor5Estrelas(validNpsResponsesForClient(rows, cid)), true);
});

test('negativo: 10→9 não entra', () => {
  const rows = [
    { client_id: cid, score: 9, submitted_at: '2026-09-01', response_id: 'b' },
    { client_id: cid, score: 10, submitted_at: '2026-06-01', response_id: 'a' },
  ];
  assert.equal(isPromotor5Estrelas(validNpsResponsesForClient(rows, cid)), false);
});

test('negativo: 8→10 não entra', () => {
  const rows = [
    { client_id: cid, score: 10, submitted_at: '2026-09-01', response_id: 'b' },
    { client_id: cid, score: 8, submitted_at: '2026-06-01', response_id: 'a' },
  ];
  assert.equal(isPromotor5Estrelas(validNpsResponsesForClient(rows, cid)), false);
});

test('negativo: apenas uma resposta 10', () => {
  const rows = [{ client_id: cid, score: 10, submitted_at: '2026-09-01', response_id: 'a' }];
  assert.equal(isPromotor5Estrelas(validNpsResponsesForClient(rows, cid)), false);
});

test('elegibilidade NÃO depende de clients.segmentacao', () => {
  const responses = [
    { client_id: cid, score: 10, submitted_at: '2026-09-01', response_id: '2' },
    { client_id: cid, score: 9, submitted_at: '2026-06-01', response_id: '1' },
  ];
  const without = evaluatePromotor5EstrelasFunnel(
    { id: cid, programa: 'PHARUS', status: 'Ativo', segmentacao: null },
    responses,
  );
  const withSeg = evaluatePromotor5EstrelasFunnel(
    { id: cid, programa: 'PHARUS', status: 'Ativo', segmentacao: 'T1' },
    responses,
  );
  assert.equal(without.eligible, true);
  assert.equal(withSeg.eligible, true);
});

test('pack materializa clientes elegíveis', () => {
  const pack = buildPromotoresFiveEstrelasPack({
    clients: [{ id: cid, name: 'Test', programa: 'PHARUS', status: 'Ativo' }],
    responses: [
      { client_id: cid, score: 10, submitted_at: '2026-09-01', response_id: '2', analytical_cycle_code: 'C2' },
      { client_id: cid, score: 10, submitted_at: '2026-06-01', response_id: '1', analytical_cycle_code: 'C1' },
    ],
    clientMecanismos: [],
    mecanismosCatalog: [],
  });
  assert.equal(pack.clients.length, 1);
  assert.equal(pack.clients[0].latest_nps_cycle, 'C2');
  assert.equal(pack.clients[0].previous_nps_cycle, 'C1');
});

test('universe audit contagens', () => {
  const audit = computeUniverseAudit(
    [{ id: cid, programa: 'PHARUS', status: 'Ativo' }],
    [
      { client_id: cid, score: 10, submitted_at: '2026-09-01', response_id: '2' },
      { client_id: cid, score: 9, submitted_at: '2026-06-01', response_id: '1' },
    ],
  );
  assert.equal(audit.eligible_total, 1);
  assert.equal(audit.clients_with_2_valid_nps, 1);
});
