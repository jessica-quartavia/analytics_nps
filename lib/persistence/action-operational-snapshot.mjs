import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANS_PATH = join(ROOT, 'data/operational/action_plans.json');
const DEPLOY_PLANS_PATH = join(ROOT, 'data/deploy/public/operational/action_plans.json');

export function writeActionPlansJsonSnapshot(doc) {
  mkdirSync(dirname(PLANS_PATH), { recursive: true });
  writeFileSync(PLANS_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  try {
    mkdirSync(dirname(DEPLOY_PLANS_PATH), { recursive: true });
    writeFileSync(DEPLOY_PLANS_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  } catch {
    /* optional */
  }
}
