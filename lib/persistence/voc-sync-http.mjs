import { verifyVocSyncBearer } from './voc-sync-auth.mjs';
import { runVocIncrementalSync } from './voc-sync-runner.mjs';
import { serializeError } from './voc-supabase-errors.mjs';

const DEFAULT_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(900_000, Number(process.env.VOC_SYNC_HTTP_TIMEOUT_MS ?? 540_000)),
);

function sanitizeHttpError(err) {
  const parsed = serializeError(err);
  try {
    return JSON.parse(parsed);
  } catch {
    return { message: parsed };
  }
}

function httpStatusFromError(err) {
  if (err?.code === 'MIGRATION_REQUIRED') return 503;
  if (String(err?.message ?? '').includes('ANALYTICS_NPS_DATABASE_URL')) return 503;
  if (err?.name === 'AbortError' || err?.code === 'VOC_SYNC_TIMEOUT') return 504;
  return 500;
}

/**
 * @param {object} input
 * @param {string} input.method
 * @param {string|undefined} input.authorization
 * @param {object|undefined} input.body
 * @param {number} [input.timeoutMs]
 */
export async function executeVocSyncHttpRequest(input) {
  if (input.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  }

  const auth = verifyVocSyncBearer(input.authorization);
  if (!auth.ok) {
    return { status: 401, body: { ok: false, error: 'Unauthorized', code: auth.code } };
  }

  const body = input.body ?? {};
  const limit = body.limit != null ? Number(body.limit) : undefined;
  const dryRun = Boolean(body.dryRun);
  const force = Boolean(body.force);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      runVocIncrementalSync({
        limit,
        dryRun,
        force,
        triggerType: 'scheduled',
      }),
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          const e = new Error('VOC sync HTTP timeout');
          e.code = 'VOC_SYNC_TIMEOUT';
          e.name = 'AbortError';
          reject(e);
        });
      }),
    ]);
    clearTimeout(timer);

    return {
      status: 200,
      body: {
        ok: true,
        processed: result.processed,
        gemini: result.gemini,
        fallback: result.fallback,
        review_queue: result.review_queue,
        run_id: result.run_id,
        status: result.status,
        dry_run: result.dry_run ?? false,
        responses_found: result.responses_found,
        source_mode: result.source_mode,
        pending_found: result.pending_found ?? result.responses_found,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      status: httpStatusFromError(err),
      body: {
        ok: false,
        error: sanitizeHttpError(err),
        code: err?.code ?? err?.analyticsCode ?? 'VOC_SYNC_FAILED',
      },
    };
  }
}

/** Vercel / Node HTTP adapter */
export async function handleVocSyncVercel(req, res) {
  let body = req.body;
  if (body == null && typeof req.on === 'function') {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    }).catch(() => ({}));
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  const out = await executeVocSyncHttpRequest({
    method: req.method,
    authorization: auth,
    body,
  });

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(out.status).json(out.body);
    return;
  }
  const payload = JSON.stringify(out.body);
  res.writeHead(out.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}
