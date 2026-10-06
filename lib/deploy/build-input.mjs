import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lê JSON de data/<rel> ou fallback data/deploy/public/<rel> (build Vercel).
 */
export function readDataJson(projectRoot, rel, fallback = null) {
  const candidates = [
    join(projectRoot, 'data', rel),
    join(projectRoot, 'data/deploy/public', rel),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
  }
  return fallback;
}

export function historicoCsvCandidates(projectRoot) {
  return [
    join(projectRoot, 'data/deploy/sources/NPS_PHARUS_consolidado.csv'),
    join(projectRoot, 'data/external/NPS_PHARUS_consolidado.csv'),
    join(projectRoot, '..', 'NPS_PHARUS_consolidado.csv'),
  ];
}
