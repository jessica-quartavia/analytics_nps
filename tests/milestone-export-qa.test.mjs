import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  qaExportedSource,
  buildMilestoneExportQaDoc,
} from '../lib/data/milestone-export-qa.mjs';
import { pharusMilestoneClientScope } from '../lib/data/fetch-milestone-sources.mjs';

test('qaExportedSource counts rows and gaps', () => {
  const rows = [
    { client_id: 'a', start_time: '2026-01-01T00:00:00Z' },
    { client_id: null, start_time: '2026-02-01T00:00:00Z' },
    { client_id: 'b' },
  ];
  const q = qaExportedSource(rows, { name: 'client_meetings.json' });
  assert.equal(q.rows, 3);
  assert.equal(q.distinct_clients, 2);
  assert.equal(q.missing_client_id, 1);
  assert.equal(q.missing_timestamp, 1);
  assert.ok(q.min_date);
  assert.ok(q.max_date);
});

test('buildMilestoneExportQaDoc keys by file', () => {
  const doc = buildMilestoneExportQaDoc({
    'client_meetings.json': [{ client_id: 'x', start_time: '2026-01-01' }],
  });
  assert.ok(doc.sources['client_meetings.json']);
  assert.equal(doc.sources['client_meetings.json'].rows, 1);
});

test('pharusMilestoneClientScope filters non-PHARUS when client known', () => {
  const clientsMap = new Map([
    ['p1', { id: 'p1', programa: 'PHARUS' }],
    ['o1', { id: 'o1', programa: 'OUTRO' }],
  ]);
  const ids = pharusMilestoneClientScope(
    [{ client_id: 'p1' }, { client_id: 'o1' }],
    [],
    clientsMap,
  );
  assert.deepEqual(new Set(ids), new Set(['p1']));
});
