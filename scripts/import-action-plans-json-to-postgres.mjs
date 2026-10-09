#!/usr/bin/env node
/**
 * Import idempotente de data/operational/action_plans.json → Business Data.
 */
import './load-dotenv.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBusinessDataAdminClient } from '../lib/persistence/voc-supabase-store.mjs';
import {
  upsertActionCase,
  upsertActionPlanRow,
  appendActionPlanHistory,
  fetchOperationalPlansDocument,
} from '../lib/persistence/action-operational-postgres.mjs';
import { writeActionPlansJsonSnapshot } from '../lib/persistence/action-operational-snapshot.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'data/operational/action_plans.json');

async function main() {
  const supabase = createBusinessDataAdminClient(process.env);
  if (!supabase) {
    console.error('Supabase Business Data não configurado.');
    process.exit(1);
  }
  if (!existsSync(jsonPath)) {
    console.log('Sem action_plans.json — nada a importar.');
    return;
  }
  const doc = JSON.parse(readFileSync(jsonPath, 'utf8'));
  let imported = 0;
  for (const e of doc.entries ?? []) {
    const actionCase = await upsertActionCase(supabase, {
      client_id: e.client_id,
      response_id: e.response_id,
      cycle_code: e.cycle_code,
      human_priority: e.human_priority ?? null,
      urgency: e.urgency ?? null,
      suggested_owner_area: e.suggested_owner_area ?? null,
      action_category: e.action_category ?? null,
      ai_priority: e.ai_priority ?? null,
    });
    if (e.priority_review) {
      await appendActionPlanHistory(
        supabase,
        actionCase.id,
        'priority_changed',
        { priority_review: e.priority_review, human_priority: e.human_priority },
        e.priority_review.reviewed_by ?? 'import',
      );
    }
    if (e.plan) {
      await upsertActionPlanRow(
        supabase,
        actionCase.id,
        {
          client_id: e.client_id,
          response_id: e.response_id,
          cycle_code: e.cycle_code,
          ...e.plan,
          plan_origin: e.plan.plan_origin ?? 'manual',
        },
        { email: e.plan.updated_by ?? 'import@json', name: 'JSON import' },
      );
    }
    for (const h of e.history ?? []) {
      await appendActionPlanHistory(
        supabase,
        actionCase.id,
        h.type ?? 'legacy_import',
        h.snapshot ?? h,
        h.by ?? 'import',
      );
    }
    imported += 1;
  }
  const out = await fetchOperationalPlansDocument(supabase);
  writeActionPlansJsonSnapshot(out);
  console.log(`[import-action-plans] ${imported} entradas importadas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
