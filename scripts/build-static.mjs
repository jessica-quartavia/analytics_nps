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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const PROCESSED_ARTIFACTS = [
  'cycles.json',
  'responses.json',
  'cycle_summary.json',
  'eligible_clients.json',
  'paired_cycles.json',
  'migration_matrix.json',
  'ep_summary.json',
  'response_topics.json',
  'topic_summary.json',
  'csat_summary.json',
  'client_satisfaction_summary.json',
  'driver_tests.json',
  'drivers_summary.json',
  'comment_drivers.json',
  'action_queue_enriched.json',
  'executive_diagnosis.json',
];

const DATA_FILES = [
  { src: 'data/outputs/action_queue.json', dest: 'data/outputs/action_queue.json' },
  { src: 'data/snapshots/latest.json', dest: 'data/snapshots/latest.json' },
  { src: 'data/quality/data_quality.json', dest: 'data/quality/data_quality.json' },
  { src: 'data/operational/action_tracking.json', dest: 'data/operational/action_tracking.json' },
];

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

function copyIfExists(srcRel, destRel) {
  const src = join(ROOT, srcRel);
  if (!existsSync(src)) return false;
  const dest = join(DIST, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  return true;
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

  mkdirSync(join(DIST, 'data/processed'), { recursive: true });
  const copiedProcessed = [];
  for (const name of PROCESSED_ARTIFACTS) {
    if (copyIfExists(`data/processed/${name}`, `data/processed/${name}`)) {
      copiedProcessed.push(name);
    }
  }

  const copiedData = [];
  for (const { src, dest } of DATA_FILES) {
    if (copyIfExists(src, dest)) copiedData.push(dest);
  }

  const securityErrors = auditDistSecurity(DIST);
  if (securityErrors.length) {
    throw new Error(`Build bloqueado — auditoria de segurança:\n${securityErrors.join('\n')}`);
  }

  return {
    dist: DIST,
    copiedProcessed,
    copiedData,
    indexHtml: join(DIST, 'index.html'),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = buildStatic();
    console.log('Build estático OK:', result.dist);
    console.log(`  processed: ${result.copiedProcessed.length} arquivos`);
    console.log(`  data extra: ${result.copiedData.join(', ') || '(nenhum)'}`);
    console.log(`  index: ${existsSync(result.indexHtml) ? 'dist/index.html' : 'AUSENTE'}`);
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}
