#!/usr/bin/env node
/**
 * Contagem de classifier_source nos datasets públicos (NPS atual + BASE0).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDataJson } from '../lib/deploy/build-input.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(rel) {
  return readDataJson(root, rel, null);
}

function bucketRows(rows, label) {
  const bySource = {};
  let total = 0;
  for (const r of rows ?? []) {
    total += 1;
    const src = r.classifier_source ?? r.classification_source ?? 'sem_metadata';
    bySource[src] = (bySource[src] ?? 0) + 1;
  }
  const pct = (n) => (total ? Math.round((1000 * n) / total) / 10 : 0);
  const summary = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => ({ source, n, pct: pct(n) }));
  return { label, total, bySource: summary };
}

function main() {
  const rt = load('processed/response_topics.json') ?? [];
  const voc = load('processed/voc_all_periods.json');
  const base0Topics = voc?.response_topics ?? voc?.topics ?? [];
  const current = bucketRows(Array.isArray(rt) ? rt : [], 'NPS_atual_response_topics');
  const base0 = bucketRows(Array.isArray(base0Topics) ? base0Topics : [], 'voc_all_periods');
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), current, base0 }, null, 2));
}

main();
