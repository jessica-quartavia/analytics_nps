/**
 * Servidor estático local — serve dashboard/ e data/ (sem Supabase).
 * POST /api/operational/action_tracking persiste tracking operacional (file-based).
 */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertTrackingEntry } from '../lib/analytics/action-tracking.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const TRACKING_PATH = join(ROOT, 'data/operational/action_tracking.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/' || clean === '') {
    return join(ROOT, 'dashboard', 'index.html');
  }
  if (clean.startsWith('/data/')) {
    return join(ROOT, clean.slice(1));
  }
  if (clean.startsWith('/css/') || clean.startsWith('/js/')) {
    return join(ROOT, 'dashboard', clean.slice(1));
  }
  if (clean.startsWith('/dashboard/')) {
    return join(ROOT, clean.slice(1));
  }
  return join(ROOT, 'dashboard', clean.replace(/^\//, ''));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleTrackingPost(req, res) {
  try {
    const raw = await readBody(req);
    const patch = JSON.parse(raw || '{}');
    if (!patch.client_id || !patch.cycle_code) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'client_id e cycle_code são obrigatórios' }));
      return;
    }
    let existing = { entries: [], updated_at: null };
    try {
      existing = JSON.parse(await readFile(TRACKING_PATH, 'utf8'));
    } catch {
      /* novo arquivo */
    }
    const updated = upsertTrackingEntry(existing, patch);
    await writeFile(TRACKING_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, entry: updated.entries.find(
      (e) => e.client_id === patch.client_id && e.cycle_code === patch.cycle_code,
    ) }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message ?? 'Erro ao salvar tracking' }));
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (req.method === 'POST' && urlPath === '/api/operational/action_tracking') {
    await handleTrackingPost(req, res);
    return;
  }

  try {
    const filePath = await resolvePath(req.url ?? '/');
    const body = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`NPS Dashboard: http://localhost:${PORT}/`);
});
