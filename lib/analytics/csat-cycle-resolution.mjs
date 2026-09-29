import { resolveCycleBounds } from './analytical-cycles.mjs';
import { isWithinBounds } from './analytical-cycles.mjs';

/**
 * Mapeia submitted_at → analytical_cycle_code (PHARUS) quando a janela é segura.
 * @param {string|null} submittedAt
 * @param {object} client
 * @param {Array<object>} analyticalConfig
 * @param {Array<object>} sourceCyclesFromDb
 */
function resolveFromWindows(submittedAt, windows) {
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    let ends = w.ends_at;
    if (!ends && i < windows.length - 1) {
      ends = windows[i + 1].starts_at;
    }
    if (isWithinBounds(submittedAt, w.starts_at, ends)) {
      return {
        analytical_cycle_code: w.cycle_code,
        cycle_resolution_method: ends === w.ends_at ? 'cycle_bounds' : 'bounded_by_next_cycle_start',
      };
    }
  }
  return { analytical_cycle_code: null, cycle_resolution_method: 'outside_analytical_windows' };
}

export function resolveCsatAnalyticalCycle(
  submittedAt,
  client,
  analyticalConfig,
  sourceCyclesFromDb,
  processedCyclesCatalog = null,
) {
  if (!submittedAt) {
    return { analytical_cycle_code: null, cycle_resolution_method: 'missing_submitted_at' };
  }
  if (client?.programa && client.programa !== 'PHARUS') {
    return { analytical_cycle_code: null, cycle_resolution_method: 'program_not_pharus' };
  }

  if (processedCyclesCatalog?.length) {
    const sorted = [...processedCyclesCatalog].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const windows = sorted.map((c) => ({
      cycle_code: c.cycle_code,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
    }));
    return resolveFromWindows(submittedAt, windows);
  }

  const sorted = [...analyticalConfig].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const windows = sorted.map((def) => {
    const bounds = resolveCycleBounds(def, sourceCyclesFromDb);
    return { cycle_code: def.cycle_code, ...bounds };
  });

  return resolveFromWindows(submittedAt, windows);
}
