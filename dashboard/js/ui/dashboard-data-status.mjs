import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatDateTime, formatTime } from '../utils/format.js';
import { getDataFreshness, getDashboardServerConfigSnapshot } from '../data/analytics-store.js';
import { isDashboardRefreshInProgress } from '../data/dashboard-refresh-controller.mjs';

/**
 * Bloco global único: dados atualizados, última verificação, botão refresh.
 * @param {{ dataUpdatedAt?: string | null, onRefresh?: () => void, authHtml?: string }} ctx
 */
export function renderDashboardDataStatus(ctx = {}) {
  const freshness = getDataFreshness();
  const dataUpdatedRaw = ctx.dataUpdatedAt ?? freshness.dataUpdatedAt;
  const dataUpdatedLabel = formatDateTime(dataUpdatedRaw);
  const lastCheckLabel = freshness.lastCheckedAt ? formatTime(freshness.lastCheckedAt) : '—';
  const busy = isDashboardRefreshInProgress();
  const serverCfg = getDashboardServerConfigSnapshot();
  const baseQvNotReady = serverCfg?.base_qv && serverCfg.base_qv.ready === false;
  const cacheTitle = baseQvNotReady
    ? 'Runtime BASE QV indisponível no servidor (verifique BASE_QV_SUPABASE_SERVICE_ROLE_KEY = service_role na Vercel Production). KPIs vêm do snapshot estático.'
    : 'KPIs do ciclo corrente podem vir do snapshot estático até o refresh BASE QV concluir.';
  const cacheBadge =
    freshness.dataSource === 'static'
      ? `<span class="badge badge--coral-soft dashboard-data-status__cache" title="${escapeAttr(cacheTitle)}">Dados em cache</span>`
      : '';
  const updatingNote = busy
    ? '<span class="dashboard-data-status__hint">Buscando dados mais recentes…</span>'
    : '';

  return `
    ${ctx.authHtml ?? ''}
    <div class="dashboard-data-status" role="region" aria-label="Status dos dados">
      <div class="dashboard-data-status__fields">
        <div class="dashboard-data-status__field">
          <span class="dashboard-data-status__label">Dados atualizados</span>
          <span class="dashboard-data-status__value" title="${escapeAttr(dataUpdatedRaw ?? '')}">${escapeHtml(dataUpdatedLabel)}</span>
          ${cacheBadge}
          ${updatingNote}
        </div>
        <div class="dashboard-data-status__field">
          <span class="dashboard-data-status__label">Última verificação</span>
          <span class="dashboard-data-status__value">${escapeHtml(lastCheckLabel)}</span>
        </div>
      </div>
      <button type="button" class="btn btn--primary dashboard-data-status__btn" id="topbar-refresh-now" ${busy ? 'disabled' : ''} aria-busy="${busy ? 'true' : 'false'}">
        ${busy ? 'Atualizando…' : '↻ Atualizar agora'}
      </button>
    </div>`;
}

export function bindDashboardDataStatus(host, { onRefresh } = {}) {
  host.querySelector('#topbar-refresh-now')?.addEventListener('click', () => {
    onRefresh?.();
  });
}
