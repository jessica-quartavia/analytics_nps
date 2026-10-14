import { dashboardAutoRefreshMs } from './dashboard-refresh-config.mjs';
import {
  refreshAnalyticsData,
  subscribeDataRefresh,
  isAnalyticsRefreshInProgress,
} from './analytics-store.js';

let intervalId = null;
let lastScheduledAt = 0;
/** @type {Set<(detail: object) => void>} */
const listeners = new Set();

export function onDashboardRefresh(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(detail) {
  for (const fn of listeners) {
    try {
      fn(detail);
    } catch (err) {
      console.error('[dashboard-refresh]', err);
    }
  }
}

async function runRefresh({ manual = false } = {}) {
  if (isAnalyticsRefreshInProgress()) return { status: 'skipped', reason: 'in_progress' };
  if (!manual && document.visibilityState === 'hidden') {
    return { status: 'skipped', reason: 'hidden_tab' };
  }
  emit({ phase: 'start', manual });
  try {
    const result = await refreshAnalyticsData({ force: true, mode: 'light', background: !manual });
    lastScheduledAt = Date.now();
    emit({ phase: 'done', manual, ...result, dataSource: result.dataSource ?? null });
    return result;
  } catch (err) {
    emit({ phase: 'error', manual, error: err });
    return { status: 'failed', error: err };
  }
}

export function isDashboardRefreshInProgress() {
  return isAnalyticsRefreshInProgress();
}

export async function refreshDashboardNow() {
  return runRefresh({ manual: true });
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  const elapsed = Date.now() - lastScheduledAt;
  if (elapsed >= dashboardAutoRefreshMs()) {
    runRefresh({ manual: false });
  }
}

/**
 * Controlador global: intervalo + visibilidade + lock contra concorrência.
 * @param {{ onResult?: (detail: object) => void }} [opts]
 */
export function startDashboardRefreshController(opts = {}) {
  if (opts.onResult) onDashboardRefresh(opts.onResult);
  lastScheduledAt = Date.now();
  if (intervalId != null) clearInterval(intervalId);
  intervalId = setInterval(() => {
    runRefresh({ manual: false });
  }, dashboardAutoRefreshMs());
  document.addEventListener('visibilitychange', onVisibilityChange);
  subscribeDataRefresh(() => {
    lastScheduledAt = Date.now();
  });
  return () => {
    if (intervalId != null) clearInterval(intervalId);
    intervalId = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
