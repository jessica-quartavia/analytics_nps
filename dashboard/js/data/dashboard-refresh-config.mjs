/** Intervalo padrão do auto-refresh global do dashboard (minutos). */
export const DASHBOARD_AUTO_REFRESH_MINUTES = 15;

export function dashboardAutoRefreshMs() {
  return DASHBOARD_AUTO_REFRESH_MINUTES * 60 * 1000;
}
