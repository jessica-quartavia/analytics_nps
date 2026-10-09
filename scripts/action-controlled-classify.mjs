#!/usr/bin/env node
/**
 * Classifica N itens da fila via classifyActionUnit + Postgres + patch JSON local.
 * Uso: node scripts/action-controlled-classify.mjs --limit=5
 */
import './load-dotenv.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyActionUnit } from '../lib/analytics/action-unit-classifier.mjs';
import { createBusinessDataAdminClient } from '../lib/persistence/voc-supabase-store.mjs';
import { upsertActionClassification } from '../lib/persistence/action-postgres-store.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const enrichedPath = join(root, 'data/processed/action_queue_enriched.json');
const deployPath = join(root, 'data/deploy/public/processed/action_queue_enriched.json');

function parseLimit() {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? Math.max(1, Number(arg.split('=')[1]) || 5) : 5;
}

function mergeAiIntoEntry(entry, result) {
  const c = result.classification;
  return {
    ...entry,
    ai_theme: c.theme,
    ai_priority: c.priority,
    ai_urgency: c.urgency,
    ai_action_category: c.action_category,
    ai_suggested_owner_area: c.suggested_owner_area,
    ai_confidence: c.confidence,
    ai_reason: c.reason,
    ai_evidence: c.evidence,
    ai_classifier_source: result.classifier_source,
    ai_prompt_version: result.prompt_version,
    ai_model: result.model,
    ai_classified_at: new Date().toISOString(),
    ai_reviewed: false,
  };
}

async function main() {
  const limit = parseLimit();
  const doc = JSON.parse(readFileSync(enrichedPath, 'utf8'));
  const candidates = (doc.entries ?? []).filter((e) => !e.ai_classifier_source && e.response_id);
  const picked = candidates.slice(0, limit);
  if (!picked.length) {
    console.log('[action-controlled] Nenhum item pendente de classificação IA.');
    return;
  }

  let supabase;
  try {
    supabase = createBusinessDataAdminClient();
  } catch {
    supabase = null;
  }

  const byId = new Map((doc.entries ?? []).map((e) => [e.response_id, e]));
  for (const item of picked) {
    const result = await classifyActionUnit({ ...item, source_id: item.response_id });
    if (!result.ok) {
      console.warn('[action-controlled] falhou', item.response_id, result.error);
      continue;
    }
    console.log(
      `[action-controlled] ${item.client_name ?? item.response_id} → ${result.classifier_source} ${result.classification.priority}/${result.classification.theme}`,
    );
    if (supabase) {
      try {
        await upsertActionClassification(supabase, {
          source_id: item.response_id,
          ...result.classification,
          classifier_source: result.classifier_source,
          ai_provider: result.provider,
          ai_model: result.model,
          prompt_version: result.prompt_version,
          model: result.model,
          input_hash: result.input_hash,
          needs_human_review: result.needs_human_review ?? false,
          fallback_reason: result.fallback_reason ?? null,
        });
      } catch (e) {
        console.warn('[action-controlled] Postgres indisponível:', e.message);
      }
    }
    byId.set(item.response_id, mergeAiIntoEntry(item, result));
  }

  doc.entries = (doc.entries ?? []).map((e) => byId.get(e.response_id) ?? e);
  doc.meta = { ...(doc.meta ?? {}), ai_classified_sample: picked.length };
  writeFileSync(enrichedPath, JSON.stringify(doc, null, 2), 'utf8');
  try {
    writeFileSync(deployPath, JSON.stringify(doc, null, 2), 'utf8');
  } catch {
    /* deploy path optional locally */
  }
  console.log(`[action-controlled] Atualizado ${enrichedPath} (${picked.length} itens).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
