import { loadVocDbMode } from './voc-db-config.mjs';
import { loadVocSourceMode } from './voc-source-config.mjs';
import { loadVocAiConfig } from '../analytics/voc-ai-config.mjs';

/**
 * Health leve — sem Gemini, sem query pesada na BASE QV.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildVocSyncHealthPayload(env = process.env) {
  const ai = loadVocAiConfig(env);
  const classifier =
    ai.geminiActivated || (ai.useGemini && ai.geminiConfigured)
      ? 'gemini'
      : ai.provider || 'rules';

  return {
    ok: true,
    service: 'analytics-nps-voc-sync',
    source_mode: loadVocSourceMode(env),
    db_mode: loadVocDbMode(env),
    classifier,
  };
}

/** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} res */
export async function handleVocSyncHealthVercel(req, res) {
  if (req.method !== 'GET') {
    const body = { ok: false, error: 'Method not allowed' };
    if (typeof res.status === 'function') {
      res.status(405).json(body);
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
    return;
  }

  const payload = buildVocSyncHealthPayload();
  if (typeof res.status === 'function') {
    res.status(200).json(payload);
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}
