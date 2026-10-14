/**
 * Roteamento HTTP único (dev-server + contrato documentado).
 * Retorna true se a requisição foi tratada.
 */
import { handleDashboardApi } from './dashboard-api-router.mjs';
import { handleVocApi } from './voc-api-router.mjs';
import { handleActionsApi } from './actions-api-router.mjs';
import { handleSystemApi } from './system-api-router.mjs';
import { sendJson } from './api-response.mjs';

/** Mapeia paths legados → router + action (rewrites Vercel espelham isso). */
const LEGACY_ROUTES = [
  { prefix: '/api/dashboard/config', router: 'dashboard', action: 'config' },
  { prefix: '/api/dashboard/refresh', router: 'dashboard', action: 'refresh' },
  { prefix: '/api/dashboard/current-nps', router: 'dashboard', action: 'current-nps' },
  { prefix: '/api/voc-classify/health', router: 'voc', action: 'classify-health' },
  { prefix: '/api/voc-classify', router: 'voc', action: 'classify' },
  { prefix: '/api/voc-prepare', router: 'voc', action: 'prepare' },
  { prefix: '/api/voc-manual-review', router: 'voc', action: 'review' },
  { prefix: '/api/voc-sync/health', router: 'voc', action: 'sync-health' },
  { prefix: '/api/voc-sync', router: 'voc', action: 'sync' },
  { prefix: '/api/action-operational/plans', router: 'actions', action: 'plans' },
  { prefix: '/api/action-classify', router: 'actions', action: 'classify' },
  { prefix: '/api/system/logs', router: 'system', action: 'logs' },
  { prefix: '/api/portal-audit/logs', router: 'system', action: 'portal-audit' },
];

function resolveRoute(fullUrl) {
  const pathOnly = decodeURIComponent(String(fullUrl).split('?')[0]);

  if (pathOnly === '/api/dashboard') {
    return { router: 'dashboard', reqUrl: fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}` };
  }
  if (pathOnly === '/api/voc') {
    return { router: 'voc', reqUrl: fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}` };
  }
  if (pathOnly === '/api/actions') {
    return { router: 'actions', reqUrl: fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}` };
  }
  if (pathOnly === '/api/system') {
    return { router: 'system', reqUrl: fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}` };
  }

  for (const leg of LEGACY_ROUTES) {
    if (pathOnly === leg.prefix) {
      const qs = fullUrl.includes('?') ? fullUrl.slice(fullUrl.indexOf('?')) : '';
      const baseQs = new URLSearchParams(qs.replace(/^\?/, ''));
      if (!baseQs.get('action')) baseQs.set('action', leg.action);
      const routerPath =
        leg.router === 'dashboard'
          ? '/api/dashboard'
          : leg.router === 'voc'
            ? '/api/voc'
            : leg.router === 'actions'
              ? '/api/actions'
              : '/api/system';
      return { router: leg.router, reqUrl: `${routerPath}?${baseQs.toString()}` };
    }
  }
  return null;
}

export async function tryHandleConsolidatedApi(req, res, urlPath) {
  const full = req.url ?? urlPath;
  const route = resolveRoute(full);
  if (!route) return false;

  const patched = { ...req, url: route.reqUrl.includes('?') ? route.reqUrl : full };

  try {
    switch (route.router) {
      case 'dashboard':
        await handleDashboardApi(patched, res);
        break;
      case 'voc':
        await handleVocApi(patched, res);
        break;
      case 'actions':
        await handleActionsApi(patched, res);
        break;
      case 'system':
        await handleSystemApi(patched, res);
        break;
      default:
        return false;
    }
    return true;
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err.message ?? 'Internal error' },
    });
    return true;
  }
}
