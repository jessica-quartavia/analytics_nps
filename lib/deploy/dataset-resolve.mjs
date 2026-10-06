import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Resolve dataset para sync/build: data/ primeiro, depois data/deploy/public/.
 * @returns {{ path: string, origin: 'data' | 'deploy-public' } | null}
 */
export function resolvePublicDataset(projectRoot, dataRel) {
  const live = join(projectRoot, 'data', dataRel);
  if (existsSync(live)) {
    return { path: resolve(live), origin: 'data' };
  }
  const bundled = join(projectRoot, 'data/deploy/public', dataRel);
  if (existsSync(bundled)) {
    return { path: resolve(bundled), origin: 'deploy-public' };
  }
  return null;
}
