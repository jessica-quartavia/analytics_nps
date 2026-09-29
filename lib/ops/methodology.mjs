import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export function loadMethodologyConfig() {
  const path = join(ROOT, 'data/config/methodology.json');
  if (!existsSync(path)) {
    return {
      nps_method_version: 'unknown',
      voc_classifier_version: 'unknown',
      action_priority_version: 'unknown',
      drivers_version: 'unknown',
      csat_method_version: 'unknown',
    };
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}
