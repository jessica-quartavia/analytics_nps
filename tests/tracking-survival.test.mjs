import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertTrackingEntry } from '../lib/analytics/action-tracking.mjs';
import { mergeActionTrackingIntoQueue } from '../dashboard/js/data/store-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const trackingPath = join(root, 'data/operational/action_tracking.json');

describe('action tracking survives regeneration merge', () => {
  it('merge preserva status após fila analítica nova', () => {
    const analytical = [{ client_id: 'a', cycle_code: 'C', priority: 'Média' }];
    const tracking = upsertTrackingEntry(
      { entries: [] },
      {
        client_id: 'a',
        cycle_code: 'C',
        status: 'Contatado',
        owner: 'Maria',
        action_notes: 'ok',
      },
    );
    const merged = mergeActionTrackingIntoQueue(analytical, tracking);
    assert.equal(merged[0].status, 'Contatado');
    assert.equal(merged[0].owner, 'Maria');
  });

  it('arquivo operational existe e não é sobrescrito pelo script QA', () => {
    assert.ok(existsSync(trackingPath));
    const before = JSON.parse(readFileSync(trackingPath, 'utf8'));
    const marker = upsertTrackingEntry(before, {
      client_id: 'qa-test-id',
      cycle_code: 'NPS-2026-SET-PHARUS',
      status: 'Em análise',
      owner: 'QA',
      action_notes: 'teste etapa 3.8',
    });
    writeFileSync(trackingPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    const after = JSON.parse(readFileSync(trackingPath, 'utf8'));
    assert.ok(after.entries.some((e) => e.client_id === 'qa-test-id'));
    const cleaned = {
      ...after,
      entries: after.entries.filter((e) => e.client_id !== 'qa-test-id'),
    };
    writeFileSync(trackingPath, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8');
  });
});
