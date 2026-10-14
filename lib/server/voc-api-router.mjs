import { handleVocClassifyVercel, handleVocClassifyHealthVercel, handleVocPrepareVercel } from '../persistence/voc-classify-http.mjs';
import { handleVocManualReviewVercel } from '../persistence/voc-manual-review-http.mjs';
import { handleVocSyncVercel } from '../persistence/voc-sync-http.mjs';
import { handleVocSyncHealthVercel } from '../persistence/voc-sync-health.mjs';
import { methodNotAllowed, unknownAction } from './api-response.mjs';

function parseAction(req) {
  const raw = req.url ?? '/';
  const u = new URL(raw.includes('://') ? raw : `http://localhost${raw.startsWith('/') ? raw : `/${raw}`}`);
  return u.searchParams.get('action') ?? '';
}

export async function handleVocApi(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const action = parseAction(req);

  switch (action) {
    case 'classify':
      if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
      return handleVocClassifyVercel(req, res);
    case 'prepare':
      if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
      return handleVocPrepareVercel(req, res);
    case 'review':
      if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
      return handleVocManualReviewVercel(req, res);
    case 'health':
    case 'classify-health':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      return handleVocClassifyHealthVercel(req, res);
    case 'sync':
      if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
      return handleVocSyncVercel(req, res);
    case 'sync-health':
      if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
      return handleVocSyncHealthVercel(req, res);
    default:
      return unknownAction(res, action, 'voc');
  }
}
