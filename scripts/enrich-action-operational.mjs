#!/usr/bin/env node
/**
 * Enriquece action_queue_enriched: prioridade híbrida + IA (+ Postgres + overlay).
 * Uso: node scripts/enrich-action-operational.mjs [--limit=N] [--no-classify]
 */
import './load-dotenv.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichActionEntryOperational, mergeOperationalOverlay } from '../lib/analytics/action-operational-enrich.mjs';
import { selectActionEntriesForClassification } from '../lib/analytics/action-batch-select.mjs';
import { createBusinessDataAdminClient } from '../lib/persistence/voc-supabase-store.mjs';
import { fetchOperationalPlansDocument } from '../lib/persistence/action-operational-postgres.mjs';
import { persistEnrichedActionRow } from '../lib/persistence/action-operational-persist.mjs';
import { writeActionPlansJsonSnapshot } from '../lib/persistence/action-operational-snapshot.mjs';
import { loadActionAiConfig, isActionGeminiRequired } from '../lib/analytics/action-ai-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const enrichedPath = join(root, 'data/processed/action_queue_enriched.json');
const deployPath = join(root, 'data/deploy/public/processed/action_queue_enriched.json');
const auditPath = join(root, 'data/quality/action_gemini_25_audit.json');
const comparisonPath = join(root, 'data/quality/action_gemini_comparison.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 25) : null;
  const noClassify = process.argv.includes('--no-classify');
  return { limit, classify: !noClassify };
}

async function loadOverlayMap(supabase) {
  if (supabase) {
    try {
      const doc = await fetchOperationalPlansDocument(supabase);
      writeActionPlansJsonSnapshot(doc);
      const map = new Map();
      for (const e of doc.entries ?? []) {
        map.set(`${e.client_id}||${e.response_id ?? ''}||${e.cycle_code ?? ''}`, e);
      }
      return map;
    } catch (err) {
      console.warn('[action-operational] overlay Postgres failed:', err.message);
    }
  }
  const overlayPath = join(root, 'data/operational/action_plans.json');
  if (!existsSync(overlayPath)) return new Map();
  const doc = JSON.parse(readFileSync(overlayPath, 'utf8'));
  const map = new Map();
  for (const e of doc.entries ?? []) {
    map.set(`${e.client_id}||${e.response_id ?? ''}||${e.cycle_code ?? ''}`, e);
  }
  return map;
}

function buildAuditRow(row) {
  const neg = (row.topics ?? []).filter((t) => t.valence === 'Negativa').length;
  return {
    client_id: row.client_id,
    response_id: row.response_id,
    client_name: row.client_name,
    score: row.current_score,
    category: row.current_category,
    voc_negative_count: neg,
    delta: row.score_delta,
    hybrid_priority: row.hybrid_priority,
    ai_priority: row.ai_priority,
    final_priority: row.final_priority ?? row.display_priority,
    urgency: row.ai_urgency,
    area: row.ai_suggested_owner_area,
    confidence: row.ai_confidence,
    reason: row.ai_reason,
    classifier_source: row.ai_classifier_source,
  };
}

function logEnvStatus() {
  const cfg = loadActionAiConfig(process.env);
  console.log(
    JSON.stringify({
      GEMINI_API_KEY_configured: cfg.hasApiKey,
      ACTION_USE_GEMINI: cfg.useGemini,
      ACTION_AI_MODEL: cfg.model,
      geminiActivated: cfg.geminiActivated,
      ACTION_REQUIRE_GEMINI: isActionGeminiRequired(process.env),
    }),
  );
}

function vocSummary(entry) {
  const neg = (entry.topics ?? []).filter((t) => t.valence === 'Negativa');
  return neg.map((t) => t.topic).join(', ') || entry.primary_topic || '—';
}

async function main() {
  logEnvStatus();
  const { limit, classify } = parseArgs();
  const requireGemini = isActionGeminiRequired(process.env);
  const doc = JSON.parse(readFileSync(enrichedPath, 'utf8'));
  const allEntries = doc.entries ?? [];
  const supabase = createBusinessDataAdminClient(process.env);
  const overlay = await loadOverlayMap(supabase);

  let batchIds = null;
  let rankedSample = [];
  if (classify && limit) {
    const sel = selectActionEntriesForClassification(allEntries, limit);
    batchIds = sel.batchIds;
    rankedSample = sel.ranked;
    console.log(`[action-operational] batch ${limit} casos prioritários (top score ${rankedSample[0]?.score ?? 0})`);
  }

  const outEntries = [];
  let classified = 0;
  const auditRows = [];
  const comparisonRows = [];
  const delayMs = Math.max(0, Number(process.env.ACTION_AI_DELAY_MS ?? 400));

  for (const entry of allEntries) {
    const inBatch =
      batchIds != null
        ? batchIds.has(entry.response_id ?? entry.client_id)
        : !limit || rankedSample.some((r) => r.entry.response_id === entry.response_id);

    let row = entry;
    if (inBatch && classify) {
      const fallbackBefore = {
        priority: entry.ai_priority ?? null,
        urgency: entry.ai_urgency ?? null,
        area: entry.ai_suggested_owner_area ?? null,
        classifier_source: entry.ai_classifier_source ?? null,
      };
      row = await enrichActionEntryOperational(entry, { classify: true, env: process.env });
      if (requireGemini && row.ai_classifier_source !== 'gemini') {
        throw new Error(
          `[action-operational] ACTION_REQUIRE_GEMINI: caso ${entry.client_id} veio como ${row.ai_classifier_source}`,
        );
      }
      if (row.ai_classifier_source) {
        classified += 1;
        auditRows.push(buildAuditRow(row));
        comparisonRows.push({
          client_id: row.client_id,
          score: row.current_score,
          voc_summary: vocSummary(row),
          fallback: fallbackBefore,
          gemini: {
            priority: row.ai_priority,
            urgency: row.ai_urgency,
            area: row.ai_suggested_owner_area,
            confidence: row.ai_confidence,
            reason: row.ai_reason,
            classifier_source: row.ai_classifier_source,
            model: row.ai_model,
          },
          final_priority: row.final_priority ?? row.display_priority,
        });
      }
      if (delayMs && row.ai_classifier_source === 'gemini') {
        await sleep(delayMs);
      }
      if (supabase) {
        try {
          await persistEnrichedActionRow(supabase, row);
        } catch (err) {
          console.warn('[action-operational] persist failed', entry.client_id, err.message);
        }
      }
    } else if (!entry.hybrid_priority) {
      row = await enrichActionEntryOperational(entry, { classify: false, env: process.env });
    }

    const key = `${row.client_id}||${row.response_id ?? ''}||${row.cycle_code ?? ''}`;
    row = mergeOperationalOverlay(row, overlay.get(key));
    outEntries.push(row);
  }

  doc.entries = outEntries;
  doc.meta = {
    ...(doc.meta ?? {}),
    operational_enriched_at: new Date().toISOString(),
    ai_classified_count: outEntries.filter((e) => e.ai_classifier_source).length,
    hybrid_enriched: true,
    batch_classified: classified,
  };
  writeFileSync(enrichedPath, JSON.stringify(doc, null, 2), 'utf8');
  try {
    writeFileSync(deployPath, JSON.stringify(doc, null, 2), 'utf8');
  } catch {
    /* optional */
  }

  if (comparisonRows.length) {
    writeFileSync(
      comparisonPath,
      JSON.stringify({ generated_at: new Date().toISOString(), cases: comparisonRows }, null, 2),
      'utf8',
    );
  }

  if (auditRows.length) {
    const geminiCount = auditRows.filter((r) => r.classifier_source === 'gemini').length;
    const fallbackCount = auditRows.filter((r) => r.classifier_source === 'rules_fallback').length;
    const confidences = auditRows.map((r) => r.confidence).filter((c) => c != null);
    const avg =
      confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    const dist = {};
    for (const r of auditRows) {
      const p = r.final_priority ?? r.hybrid_priority ?? '—';
      dist[p] = (dist[p] ?? 0) + 1;
    }
    writeFileSync(
      auditPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          count: auditRows.length,
          gemini_count: geminiCount,
          fallback_count: fallbackCount,
          avg_confidence: avg,
          priority_distribution: dist,
          cases: auditRows,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  console.log(
    `[action-operational] ${outEntries.length} entries, ${classified} classified in batch, total IA: ${doc.meta.ai_classified_count}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
