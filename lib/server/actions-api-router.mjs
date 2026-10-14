import { handleActionOperationalVercel } from '../persistence/action-operational-http.mjs';
import { handleActionClassifyVercel } from '../persistence/action-classify-http.mjs';
import { methodNotAllowed, unknownAction } from './api-response.mjs';

function parseAction(req) {
  const raw = req.url ?? '/';
  const u = new URL(raw.includes('://') ? raw : `http://localhost${raw.startsWith('/') ? raw : `/${raw}`}`);
  return u.searchParams.get('action') ?? '';
}

/** Normaliza URL para handlers legados que inspecionam path/body.action */
function withLegacyOperationalUrl(req, action) {
  const raw = req.url ?? '/api/actions';
  const u = new URL(raw.includes('://') ? raw : `http://localhost${raw.startsWith('/') ? raw : `/${raw}`}`);
  u.pathname = '/api/action-operational/plans';
  if (action && !u.searchParams.get('action')) u.searchParams.set('action', action);
  return { ...req, url: `${u.pathname}${u.search}` };
}

export async function handleActionsApi(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const action = parseAction(req);

  switch (action) {
    case 'plans':
    case 'save-plan':
    case 'priority-review':
    case 'suggest-plan':
      return handleActionOperationalVercel(withLegacyOperationalUrl(req, action), res);
    case 'classify':
      if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
      return handleActionClassifyVercel(req, res);
    default:
      return unknownAction(res, action, 'actions');
  }
}
