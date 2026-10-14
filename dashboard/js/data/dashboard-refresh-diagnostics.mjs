/** Logs de QA — apenas localhost. */
export function isDashboardDevDiagnosticsHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location?.hostname ?? '';
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * @param {{
 *   source: 'runtime' | 'static-fallback',
 *   validResponses?: number | null,
 *   nps?: number | null,
 *   averageScore?: number | null,
 *   latestResponse?: string | null,
 *   httpStatus?: number | null,
 *   errorCode?: string | null,
 * }} detail
 */
export function logDashboardRefreshDiagnostics(detail) {
  if (!isDashboardDevDiagnosticsHost()) return;
  console.info('[dashboard-refresh] source:', detail.source);
  if (detail.validResponses != null) {
    console.info('[dashboard-refresh] validResponses:', detail.validResponses);
  }
  if (detail.nps != null) {
    console.info('[dashboard-refresh] nps:', detail.nps);
  }
  if (detail.averageScore != null) {
    console.info('[dashboard-refresh] averageScore:', detail.averageScore);
  }
  if (detail.latestResponse != null) {
    console.info('[dashboard-refresh] latestResponse:', detail.latestResponse);
  }
  if (detail.httpStatus != null) {
    console.info('[dashboard-refresh] httpStatus:', detail.httpStatus);
  }
  if (detail.errorCode) {
    console.info('[dashboard-refresh] errorCode:', detail.errorCode);
  }
}
