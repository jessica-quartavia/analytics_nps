#!/usr/bin/env node
/**
 * Build estático para Vercel: dashboard na raiz de dist/ + datasets públicos.
 */
import {
  rmSync,
  mkdirSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_PUBLIC_DATASETS,
  OPTIONAL_PUBLIC_DATASETS,
} from '../lib/deploy/public-datasets.mjs';
import { resolvePublicDataset } from '../lib/deploy/dataset-resolve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DEPLOY_PUBLIC = join(ROOT, 'data/deploy/public');

const FORBIDDEN_PATH_SEGMENTS = [
  '.env',
  'data/raw',
  'data/imports',
  'node_modules',
  'scripts',
];

const FORBIDDEN_CONTENT = [
  /service_role/i,
  /SUPABASE_SERVICE_ROLE/i,
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/,
];

function resolveDatasetSource(dataRel) {
  const resolved = resolvePublicDataset(ROOT, dataRel);
  return resolved?.path ?? null;
}

function copyDataset(dataRel) {
  const src = resolveDatasetSource(dataRel);
  if (!src) return false;
  const dest = join(DIST, 'data', dataRel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  return true;
}

function assertRequiredDatasetsInDist() {
  const missing = [];
  for (const rel of REQUIRED_PUBLIC_DATASETS) {
    if (!existsSync(join(DIST, 'data', rel))) missing.push(rel);
  }
  if (missing.length) {
    throw new Error(
      `Build incompleto — datasets obrigatórios ausentes em dist/data/:\n${missing.map((m) => `  - ${m}`).join('\n')}\n` +
        'Local: npm run refresh:nps && npm run sync:deploy-public\n' +
        'Commit data/deploy/public/ para a Vercel receber os JSON.',
    );
  }
}

function walkFiles(dir, files = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walkFiles(p, files);
    else files.push(p);
  }
  return files;
}

export function auditDistSecurity(distDir = DIST) {
  const errors = [];
  const relPaths = walkFiles(distDir).map((p) => relative(distDir, p).replace(/\\/g, '/'));

  for (const rel of relPaths) {
    for (const forbidden of FORBIDDEN_PATH_SEGMENTS) {
      if (rel === forbidden || rel.startsWith(`${forbidden}/`) || rel.includes(`/${forbidden}/`)) {
        errors.push(`Caminho proibido em dist: ${rel}`);
      }
    }
    if (/^\.env/i.test(rel) || rel.endsWith('.env')) {
      errors.push(`Arquivo .env em dist: ${rel}`);
    }
  }

  for (const file of walkFiles(distDir)) {
    const rel = relative(distDir, file);
    if (!/\.(json|html|js|css|txt|md)$/i.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const pattern of FORBIDDEN_CONTENT) {
      if (pattern.test(text)) {
        errors.push(`Conteúdo sensível em dist/${rel.replace(/\\/g, '/')}`);
        break;
      }
    }
  }

  return errors;
}

export function buildStatic() {
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true, force: true });
  }
  mkdirSync(DIST, { recursive: true });

  cpSync(join(ROOT, 'dashboard'), DIST, { recursive: true });
  mkdirSync(join(DIST, 'lib', 'analytics'), { recursive: true });
  cpSync(join(ROOT, 'lib', 'analytics', 'nps.mjs'), join(DIST, 'lib', 'analytics', 'nps.mjs'));

  const copiedData = [];
  const missingSource = [];
  for (const rel of REQUIRED_PUBLIC_DATASETS) {
    if (!resolveDatasetSource(rel)) missingSource.push(rel);
    else if (copyDataset(rel)) copiedData.push(`data/${rel}`);
  }
  for (const rel of OPTIONAL_PUBLIC_DATASETS) {
    if (copyDataset(rel)) copiedData.push(`data/${rel}`);
  }

  if (missingSource.length) {
    throw new Error(
      `Build abortado — datasets obrigatórios não encontrados em data/ nem data/deploy/public/:\n${missingSource.map((m) => `  - ${m}`).join('\n')}\n` +
        'Execute: npm run sync:deploy-public (após refresh) e commit data/deploy/public/.',
    );
  }

  assertRequiredDatasetsInDist();

  const securityErrors = auditDistSecurity(DIST);
  if (securityErrors.length) {
    throw new Error(`Build bloqueado — auditoria de segurança:\n${securityErrors.join('\n')}`);
  }

  return {
    dist: DIST,
    copiedData,
    indexHtml: join(DIST, 'index.html'),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = buildStatic();
    console.log('Build estático OK:', result.dist);
    console.log(`  datasets: ${result.copiedData.length} arquivos em dist/data/`);
    console.log(`  index: ${existsSync(result.indexHtml) ? 'dist/index.html' : 'AUSENTE'}`);
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}
