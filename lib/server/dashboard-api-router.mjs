import { getDashboardServerConfig } from '../persistence/dashboard-config-http.mjs';
import { handleDashboardConfigVercel } from '../persistence/dashboard-config-http.mjs';
import { handleDashboardRefreshVercel } from '../persistence/dashboard-refresh-http.mjs';
import { handleDashboardCurrentNpsVercel } from '../persistence/dashboard-current-nps-http.mjs';
import { methodNotAllowed, sendJson, unknownAction } from './api-response.mjs';

function parseAction(req) {
  const raw = req.url ?? '/';
  const u = new URL(raw.includes('://') ? raw : `http://localhost${raw.startsWith('/') ? raw : `/${raw}`}`);
  return u.searchParams.get('action') ?? 'config';
}

export async function handleDashboardApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, { ok: true });
    return;
  }

  const action = parseAction(req);

  switch (action) {
    case 'config':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      return handleDashboardConfigVercel(req, res);
    case 'refresh':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      return handleDashboardRefreshVercel(req, res);
    case 'current-nps':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      return handleDashboardCurrentNpsVercel(req, res);
    case 'health':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      sendJson(res, 200, { ok: true, service: 'dashboard', ...getDashboardServerConfig() });
      return;
    default:
      return unknownAction(res, action, 'dashboard');
  }
}
