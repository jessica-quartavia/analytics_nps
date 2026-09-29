import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eligibleForDriverRanking,
  driverFriendlyName,
  partitionDriverTests,
  formatPAdjusted,
  classifyDriverPresentation,
} from '../../dashboard/js/data/drivers-view.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('drivers-view 4.11', () => {
  it('unavailable não entra no ranking principal', () => {
    const t = { feature_quality: 'unavailable', driver: 'meetings_count' };
    assert.equal(eligibleForDriverRanking(t), false);
    assert.equal(classifyDriverPresentation(t), 'insufficient');
  });

  it('current_proxy vai para ressalva', () => {
    const t = { feature_quality: 'current_proxy' };
    assert.equal(classifyDriverPresentation(t), 'caveat');
    assert.equal(eligibleForDriverRanking(t), false);
  });

  it('point_in_time no ranking', () => {
    const t = { feature_quality: 'point_in_time' };
    assert.equal(classifyDriverPresentation(t), 'ranking');
    assert.equal(eligibleForDriverRanking(t), true);
  });

  it('label amigável substitui técnico', () => {
    assert.equal(driverFriendlyName('meetings_last_90d'), 'Reuniões nos últimos 90 dias');
    assert.notEqual(driverFriendlyName('meetings_last_90d'), 'meetings_last_90d');
  });

  it('p-value amigável', () => {
    assert.equal(formatPAdjusted(0.0005), 'p ajustado < 0,001');
  });

  it('artefato: meetings_count unavailable não está em ranking', () => {
    const tests = JSON.parse(readFileSync(join(root, 'data/processed/driver_tests.json'), 'utf8'));
    const set = tests.filter((t) => t.cycle_code === 'NPS-2026-SET-PHARUS' || t.cycle_code?.includes('SET'));
    const sample = set.length ? set : tests;
    const { ranking } = partitionDriverTests(sample);
    assert.ok(!ranking.some((t) => t.feature_quality === 'unavailable'));
  });
});
