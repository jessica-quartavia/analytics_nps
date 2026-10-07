import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEpSummaryEntry,
  buildEpSummaryDocument,
  validateEpSummaryInvariants,
  MIN_EP_SAMPLE,
} from '../lib/analytics/ep-summary.mjs';
import { classifyNpsScore } from '../lib/analytics/nps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

describe('ep-summary analytics', () => {
  it('MIN_EP_SAMPLE é 5', () => {
    assert.equal(MIN_EP_SAMPLE, 5);
  });

  it('P/N/D e NPS por EP', () => {
    const rows = [
      { client_id: 'c1', score: 10, nps_category: 'Promotor', ep_id: 'a', ep_name: 'EP A', analytical_cycle_code: 'C1' },
      { client_id: 'c2', score: 9, nps_category: 'Promotor', ep_id: 'a', ep_name: 'EP A', analytical_cycle_code: 'C1' },
      { client_id: 'c3', score: 5, nps_category: 'Detrator', ep_id: 'a', ep_name: 'EP A', analytical_cycle_code: 'C1' },
    ];
    const entry = buildEpSummaryEntry('C1', 'id:a', rows, [], false);
    assert.equal(entry.valid_responses, 3);
    assert.equal(entry.promoters, 2);
    assert.equal(entry.detractors, 1);
    assert.equal(entry.nps, ((2 - 1) / 3) * 100);
  });

  it('n=0 => nps null', () => {
    const entry = buildEpSummaryEntry('C1', 'id:x', [], [], false);
    assert.equal(entry.valid_responses, 0);
    assert.equal(entry.nps, null);
  });

  it('IC95 preenchido com n>0', () => {
    const rows = [{ client_id: 'c1', score: 8, nps_category: 'Neutro', ep_id: 'b', ep_name: 'B', analytical_cycle_code: 'C1' }];
    const entry = buildEpSummaryEntry('C1', 'id:b', rows, [], false);
    assert.equal(entry.nps_ci_method, 'bootstrap_percentile_95');
    assert.ok(entry.nps_ci_low != null);
    assert.ok(entry.nps_ci_high != null);
  });

  it('paired NPS e delta', () => {
    const rows = [
      {
        client_id: 'c1',
        score: 9,
        previous_score: 4,
        previous_category: 'Detrator',
        nps_category: 'Promotor',
        ep_id: 'c',
        ep_name: 'C',
        analytical_cycle_code: 'C2',
      },
      {
        client_id: 'c2',
        score: 8,
        previous_score: 7,
        previous_category: 'Neutro',
        nps_category: 'Neutro',
        ep_id: 'c',
        ep_name: 'C',
        analytical_cycle_code: 'C2',
      },
    ];
    const entry = buildEpSummaryEntry('C2', 'id:c', rows, [], true);
    assert.equal(entry.paired_clients, 2);
    assert.ok(entry.previous_nps_paired != null);
    assert.ok(entry.current_nps_paired != null);
    assert.ok(entry.delta_nps_paired != null);
    assert.equal(entry.recovered_detractors, 1);
    assert.equal(entry.recovered_detractors_denominator, 1);
  });

  it('recovered detractors denominator e deteriorated promoters', () => {
    const rows = [
      {
        client_id: 'c1',
        score: 3,
        previous_score: 10,
        previous_category: 'Promotor',
        nps_category: 'Detrator',
        ep_id: 'd',
        ep_name: 'D',
        analytical_cycle_code: 'C2',
      },
    ];
    const entry = buildEpSummaryEntry('C2', 'id:d', rows, [], true);
    assert.equal(entry.deteriorated_promoters, 1);
    assert.equal(entry.deteriorated_promoters_denominator, 1);
  });

  it('low confidence contagem', () => {
    const rows = [
      { client_id: 'c1', score: 7, ep_id: 'e', ep_name: 'E', ep_resolution_confidence: 'low', analytical_cycle_code: 'C1' },
      { client_id: 'c2', score: 8, ep_id: 'e', ep_name: 'E', ep_resolution_confidence: 'high', analytical_cycle_code: 'C1' },
    ];
    const entry = buildEpSummaryEntry('C1', 'id:e', rows, [], false);
    assert.equal(entry.ep_low_confidence, 1);
    assert.equal(entry.ep_high_confidence, 1);
    assert.equal(entry.ep_low_confidence_pct, 50);
  });

  it('response_rate null sem eligible', () => {
    const rows = [{ client_id: 'c1', score: 9, ep_id: 'f', ep_name: 'F', analytical_cycle_code: 'C1' }];
    const entry = buildEpSummaryEntry('C1', 'id:f', rows, [], false);
    assert.equal(entry.response_rate, null);
    assert.equal(entry.response_rate_quality, 'unavailable');
  });

  it('documento processado passa invariantes', () => {
    const responses = load('data/processed/responses.json');
    const eligible = load('data/processed/eligible_clients.json');
    const cycles = load('data/processed/cycles.json');
    const doc = buildEpSummaryDocument(responses, eligible, cycles, '2026-01-01');
    const errors = validateEpSummaryInvariants(doc);
    assert.equal(errors.length, 0, errors.map((e) => e.message).join('; '));
    assert.ok(doc.entries.length > 0);
  });

  it('arquivo ep_summary.json alinhado ao builder', () => {
    const responses = load('data/processed/responses.json');
    const eligible = load('data/processed/eligible_clients.json');
    const cycles = load('data/processed/cycles.json');
    const file = load('data/processed/ep_summary.json');
    const built = buildEpSummaryDocument(responses, eligible, cycles, file.data_cutoff);
    assert.equal(built.entries.length, file.entries.length);
  });
});
