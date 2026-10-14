/** Logs de timing do refresh (dev/diagnóstico). */
export function createDashboardRefreshLogger(scope = 'dashboard-refresh') {
  const t0 = Date.now();
  return {
    start(label) {
      console.info(`[${scope}] ${label} START`);
      return Date.now();
    },
    end(label, startedAt, extra = '') {
      const ms = Date.now() - (startedAt ?? t0);
      console.info(`[${scope}] ${label} END ${ms}ms${extra ? ` ${extra}` : ''}`);
      return ms;
    },
    info(msg) {
      console.info(`[${scope}] ${msg}`);
    },
    done(extra = '') {
      const ms = Date.now() - t0;
      console.info(`[${scope}] DONE ${ms}ms${extra ? ` ${extra}` : ''}`);
      return ms;
    },
  };
}
