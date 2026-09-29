#!/usr/bin/env node
/** Serve dist/ (somente leitura — sem API de tracking). */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('dist/index.html ausente — execute npm run build');
  process.exit(1);
}

function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/' || clean === '') {
    return join(ROOT, 'index.html');
  }
  const rel = clean.replace(/^\//, '');
  const candidate = join(ROOT, rel);
  if (candidate.startsWith(ROOT)) return candidate;
  return join(ROOT, 'index.html');
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url ?? '/');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
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
  console.log(`Preview estático: http://localhost:${PORT}/#/executivo`);
});
