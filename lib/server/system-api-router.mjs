import { handleSystemLogsVercel } from '../persistence/system-logs-http.mjs';
import { handlePortalAuditVercel } from '../persistence/portal-audit-http.mjs';
import { methodNotAllowed, sendJson, unknownAction } from './api-response.mjs';

function parseAction(req) {
  const raw = req.url ?? '/';
  const u = new URL(raw.includes('://') ? raw : `http://localhost${raw.startsWith('/') ? raw : `/${raw}`}`);
  return u.searchParams.get('action') ?? 'logs';
}

export async function handleSystemApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, { ok: true });
    return;
  }

  const action = parseAction(req);

  switch (action) {
    case 'logs':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      return handleSystemLogsVercel(req, res);
    case 'portal-audit':
      return handlePortalAuditVercel(req, res);
    case 'health':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      sendJson(res, 200, { ok: true, service: 'system' });
      return;
    default:
      return unknownAction(res, action, 'system');
  }
}
