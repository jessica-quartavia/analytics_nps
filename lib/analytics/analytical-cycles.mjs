import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export {
  BRAZIL_END_OF_DAY_UTC,
  resolveCycleBounds,
  operationalCycleStatus,
  isWithinBounds,
  matchesAnalyticalCycle,
  resolveAnalyticalCycleForResponse,
  dedupeByClientAndAnalyticalCycle,
  buildJunJulPharusDataset,
  getIndependentPharusSourceCycles,
} from './analytical-cycles-runtime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = join(__dirname, '../../data/config/nps-cycles.json');

/**
 * @param {string} [configPath]
 */
export function loadAnalyticalCycleConfig(configPath = DEFAULT_CONFIG_PATH) {
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}
