/**
 * CLI: sync incremental VoC → Business Data.
 */
import './load-dotenv.mjs';
import { runVocIncrementalSync } from '../lib/persistence/voc-sync-runner.mjs';
import { serializeError, exitProcess } from '../lib/persistence/voc-supabase-errors.mjs';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const triggerType = process.argv.includes('--manual')
  ? 'manual'
  : process.argv.includes('--reprocess')
    ? 'reprocess'
    : 'scheduled';

function stageLog(n, msg) {
  console.log(`[${n}] ${msg}`);
}

async function main() {
  const result = await runVocIncrementalSync({
    limit: limit && Number.isFinite(limit) ? limit : undefined,
    dryRun,
    force,
    triggerType,
    onStageLog: stageLog,
  });

  console.log(JSON.stringify(result, null, 2));
  if (dryRun) console.log('dry-run complete');
}

main().catch(async (err) => {
  console.error('VOC_SYNC_FATAL');
  console.error(serializeError(err));
  await exitProcess(1);
});
