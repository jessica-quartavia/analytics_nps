/**
 * Smoke test Business Data — sem Gemini.
 */
import './load-dotenv.mjs';
import { createVocPersistenceStore } from '../lib/persistence/voc-persistence-store.mjs';
import { loadVocDbMode } from '../lib/persistence/voc-db-config.mjs';
import { serializeError, exitProcess } from '../lib/persistence/voc-supabase-errors.mjs';

function log(msg) {
  console.log(msg);
}

async function main() {
  const mode = loadVocDbMode();
  log(`[smoke] mode: ${mode}`);

  let store;
  try {
    store = await createVocPersistenceStore();
  } catch (err) {
    console.error('ANALYTICS_CONFIG_MISSING');
    console.error(serializeError(err));
    await exitProcess(1);
  }

  const info = store.logInfo();
  log(JSON.stringify({ ...info, connected: 'pending' }, null, 2));

  log('[smoke] validate connection');
  try {
    const v = await store.validateConnection();
    log(JSON.stringify({ connection: 'OK', ...v }, null, 2));
  } catch (err) {
    console.error('ANALYTICS_DB_CONNECTION_FAILED');
    console.error(serializeError(err));
    await store.close();
    await exitProcess(1);
  }

  const active = await store.getActiveClassifierVersion();
  log(`[smoke] active_classifier_version: ${active?.classifier_version ?? 'NONE'}`);

  log('[smoke] insert test run');
  const runId = await store.startClassificationRun({
    triggerType: 'manual',
    provider: 'smoke',
    requestedModel: 'none',
    promptVersion: 'smoke',
    classifierVersion: active?.classifier_version ?? 'smoke',
  });

  await store.finishClassificationRun(runId, {
    status: 'success',
    responses_found: 0,
    responses_processed: 0,
    errors: [{ smoke: true }],
  });

  log('[smoke] delete test run');
  await store.deleteRun(runId);

  await store.close();
  log('VOC_DB_SMOKE_OK');
}

main().catch(async (err) => {
  console.error('VOC_DB_SMOKE_FATAL');
  console.error(serializeError(err));
  await exitProcess(1);
});
