/**
 * DEPRECATED — DO NOT USE
 * Project policy: databases are read-only.
 * Analytics persistence is file-based (lib/data/file-store.mjs).
 */

export function createAnalyticsDbClient() {
  throw new Error(
    'analytics-db.mjs está deprecated. Persistência analítica é file-based (data/).',
  );
}

export function createAnalyticsDbAdminClient() {
  throw new Error('analytics-db.mjs está deprecated.');
}

export async function upsertCycle() {
  throw new Error('analytics-db.mjs está deprecated.');
}

export async function listCycles() {
  throw new Error('analytics-db.mjs está deprecated.');
}

export async function startRefreshRun() {
  throw new Error('analytics-db.mjs está deprecated.');
}

export async function finishRefreshRun() {
  throw new Error('analytics-db.mjs está deprecated.');
}
