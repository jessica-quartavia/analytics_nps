import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnalyticalActiveClient } from '../lib/analytics/analytical-active-client.mjs';

const id = 'client-fixture-1';

describe('resolveAnalyticalActiveClient — regra oficial', () => {
  it('Caso 1: status Ativo, sem freeze, sem cancelamento → ativo', () => {
    const r = resolveAnalyticalActiveClient(
      { id, status: 'Ativo' },
      { cancellations: [], freezeRows: [] },
    );
    assert.equal(r.is_active_analytical, true);
    assert.equal(r.final_analytical_status, 'Ativo');
  });

  it('Caso 2: status Ativo + cancelamento efetivo → não ativo', () => {
    const r = resolveAnalyticalActiveClient(
      { id, status: 'Ativo' },
      {
        cancellations: [{ client_id: id, churn_efetivado_at: '2026-08-01T00:00:00Z' }],
        freezeRows: [],
      },
    );
    assert.equal(r.is_active_analytical, false);
    assert.match(r.final_analytical_status, /cancelamento efetivo/i);
    assert.equal(r.effective_cancellation_signal, 'cancellations.churn_efetivado_at');
  });

  it('Caso 3: status Ativo + congelado → não ativo', () => {
    const r = resolveAnalyticalActiveClient(
      { id, status: 'Ativo' },
      {
        cancellations: [],
        freezeRows: [
          {
            client_id: id,
            status: 'congelado',
            data_inicio_congelamento: '2026-07-01T00:00:00Z',
          },
        ],
      },
    );
    assert.equal(r.is_active_analytical, false);
    assert.match(r.final_analytical_status, /congelado/i);
  });

  it('Caso 4: status churn → não ativo', () => {
    const r = resolveAnalyticalActiveClient({ id, status: 'churn' }, {});
    assert.equal(r.is_active_analytical, false);
  });

  it('Caso 5: status Ativo + pedido de churn sem efetivação → permanece ativo', () => {
    const r = resolveAnalyticalActiveClient(
      { id, status: 'Ativo' },
      {
        cancellations: [
          {
            client_id: id,
            intencao_registrada_at: '2026-09-01T00:00:00Z',
            data_pedido: '2026-09-01T00:00:00Z',
          },
        ],
        freezeRows: [],
      },
    );
    assert.equal(r.is_active_analytical, true);
    assert.ok(r.churn_request_only);
  });

  it('Caso 6: status ativo (case) → ativo', () => {
    const r = resolveAnalyticalActiveClient({ id, status: 'ativo' }, {});
    assert.equal(r.is_active_analytical, true);
  });
});
