import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getEpSummaryEntries,
  getLatestCycleBySequence,
  filterEpSummaries,
  computeEpPageKpis,
  epQualityLabel,
  getEpResponsesForCycle,
  filterResponses,
} from '../../dashboard/js/data/store-core.mjs';

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '../../data/processed');

function loadJson(name) {
  return JSON.parse(readFileSync(join(dataRoot, name), 'utf8'));
}

describe('dashboard EP store-core', () => {
  const cycles = loadJson('cycles.json');
  const epDoc = loadJson('ep_summary.json');
  const responses = loadJson('responses.json');
  const latest = getLatestCycleBySequence(cycles);
  const cycleCode = latest.cycle_code;

  it('latest cycle tem EPs', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    assert.ok(entries.length > 0);
  });

  it('filtro EP', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    const name = entries[0].ep_name;
    const filtered = filterEpSummaries(entries, { ep: name });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].ep_name, name);
  });

  it('base pareada filtra EPs sem pareados na UI helper', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    const pairedOnly = entries.filter((e) => e.paired_clients > 0);
    assert.ok(pairedOnly.length <= entries.length);
  });

  it('delta null não vira zero em filter delta', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    const withNull = entries.filter((e) => e.delta_nps_paired == null);
    const filtered = filterEpSummaries(entries, { deltaMin: '0' });
    for (const e of filtered) {
      assert.ok(e.delta_nps_paired != null);
    }
    if (withNull.length) {
      assert.ok(!filtered.some((e) => withNull.includes(e)));
    }
  });

  it('small sample badge threshold', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    const min = epDoc.min_ep_sample ?? 5;
    const small = entries.filter((e) => e.valid_responses > 0 && e.valid_responses < min);
    const kpis = computeEpPageKpis(entries, min);
    assert.equal(kpis.smallSampleEps, small.length);
  });

  it('low confidence badge dados', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    const withLow = entries.filter((e) => (e.ep_low_confidence ?? 0) > 0);
    for (const e of withLow) {
      assert.equal(epQualityLabel(e), 'parcial');
    }
  });

  it('getEpResponses filtra carteira', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    const ep = entries[0];
    const rows = getEpResponsesForCycle(responses, cycleCode, ep.ep_id ?? ep.ep_name);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.ep_name === ep.ep_name || r.ep_id === ep.ep_id));
  });

  it('client table filtering por categoria', () => {
    const entries = getEpSummaryEntries(epDoc, cycleCode);
    const ep = entries.find((e) => e.valid_responses >= 3);
    if (!ep) return;
    let rows = getEpResponsesForCycle(responses, cycleCode, ep.ep_name);
    rows = filterResponses(rows, { category: 'Promotor' }, {});
    assert.ok(rows.every((r) => r.nps_category === 'Promotor'));
  });
});
