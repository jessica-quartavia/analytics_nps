/**
 * Simula nova regra Investigar (temas negativos entre Promotores) vs fila enriquecida atual.
 * Uso: node scripts/simulate-promotor-investigate-neg-topics.mjs [path action_queue_enriched.json]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeActionPriority } from '../lib/analytics/action-priority.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.join(
  __dirname,
  '../data/processed/action_queue_enriched.json',
);

const NEG_TOPICS_RULE = 'Comentário com múltiplos temas negativos entre Promotores';

function entryToRow(entry) {
  return {
    nps_migration: entry.nps_migration,
    evolution_status: entry.evolution_status,
    nps_category: entry.current_category,
    previous_category: entry.previous_category,
    score_delta: entry.score_delta,
    current_score: entry.current_score,
    consecutive_detractor: entry.consecutive_detractor ?? false,
    promotor_consistent: (entry.priority_rules ?? []).some((r) =>
      r.includes('Promotor consistente'),
    ),
    critical_flag: entry.critical_flag ?? false,
    comment: entry.comment,
    is_paired_with_previous: entry.previous_score != null,
  };
}

function entryToCtx(entry) {
  const topics = entry.topics ?? entry.negative_topics ?? [];
  const neg = entry.negative_topics ?? topics.filter((t) => t.valence === 'Negativa');
  return {
    has_csat: entry.has_csat ?? false,
    latest_csat_score: entry.latest_csat_score ?? null,
    csat_average: entry.csat_average ?? null,
    negative_topics_count: neg.length,
    topics_count: (entry.topics ?? topics).length,
    topics: entry.topics ?? topics,
    comment: entry.comment,
  };
}

function hadOldInvestigateNegTopics(entry) {
  return (
    entry.priority === 'Investigar' &&
    (entry.priority_rules ?? []).some((r) => r.includes('temas negativos'))
  );
}

async function main() {
  const file = process.argv[2] ?? defaultPath;
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const entries = raw.entries ?? [];

  const cohort = entries.filter(hadOldInvestigateNegTopics);
  const counts = {
    cohort_size: cohort.length,
    stays_investigate: 0,
    becomes_qualitative_aprendizado: 0,
    becomes_qualitative_other: 0,
    becomes_aprendizado_only: 0,
    becomes_media_or_alta: 0,
    leaves_queue: 0,
  };

  const samples = { stays: [], qualitative: [], other: [] };

  for (const entry of cohort) {
    const computed = computeActionPriority(entryToRow(entry), entryToCtx(entry));
    const p = computed.priority;
    const q = computed.qualitative_signal;

    if (p === 'Investigar') {
      counts.stays_investigate++;
      if (samples.stays.length < 5) samples.stays.push(entry.client_name);
    } else if (q && p === 'Aprendizado') {
      counts.becomes_qualitative_aprendizado++;
      if (samples.qualitative.length < 8) samples.qualitative.push(entry.client_name);
    } else if (q) {
      counts.becomes_qualitative_other++;
    } else if (p === 'Aprendizado') {
      counts.becomes_aprendizado_only++;
    } else if (p === 'Média' || p === 'Alta') {
      counts.becomes_media_or_alta++;
    } else {
      counts.leaves_queue++;
    }
  }

  const newInvestigateNeg = entries.filter((e) => {
    const c = computeActionPriority(entryToRow(e), entryToCtx(e));
    return c.priority === 'Investigar' && c.priority_reasons.some((r) => r.includes('temas negativos'));
  }).length;

  console.log(JSON.stringify({
    file,
    rule: NEG_TOPICS_RULE,
    before: {
      investigate_by_neg_topics_among_promoters: cohort.length,
      investigate_total: entries.filter((e) => e.priority === 'Investigar').length,
    },
    after_simulation: {
      investigate_by_neg_topics_among_promoters: newInvestigateNeg,
      cohort_outcomes: counts,
      sample_qualitative_aprendizado: samples.qualitative,
      sample_still_investigate: samples.stays,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
