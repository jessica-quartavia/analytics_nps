import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandResponsesToWorkItems } from './voc-source-units.mjs';

/**
 * Fonte local — data/processed/responses.json (dev / auditoria).
 * @param {string} projectRoot
 */
export function loadResponsesFromFile(projectRoot) {
  return JSON.parse(readFileSync(join(projectRoot, 'data/processed/responses.json'), 'utf8'));
}

export function loadWorkItemsFromFile(projectRoot) {
  return expandResponsesToWorkItems(loadResponsesFromFile(projectRoot));
}
