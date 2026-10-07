#!/usr/bin/env node
/**
 * Smoke test — conexão read-only ao Supabase App PHARUS.
 * Não imprime secrets nem linhas sensíveis.
 */
import { loadProjectDotenv, logPharusEnvStatus, pharusProjectRef } from '../lib/pharus/env.mjs';
import { smokePharusConnection } from '../lib/pharus/app-cadastro.mjs';
import { getPharusSupabaseConfig } from '../lib/pharus/env.mjs';

async function main() {
  loadProjectDotenv();
  const cfg = logPharusEnvStatus();
  if (!cfg.configured) {
    console.error('[smoke:pharus-app] Configure PHARUS_SUPABASE_URL e PHARUS_SUPABASE_SERVICE_ROLE_KEY no .env');
    process.exit(1);
  }

  const ref = pharusProjectRef(cfg.url);
  console.log(`pharus_project_ref: ${ref ?? '(invalid url)'}`);

  const smoke = await smokePharusConnection(getPharusSupabaseConfig());
  console.log(`connection_ok: ${smoke.connected}`);
  console.log(`app_table: ${smoke.source}`);
  console.log(`app_records_count: ${smoke.app_records}`);

  if (smoke.column_mapping?.mapped) {
    console.log('column_mapping:', JSON.stringify(smoke.column_mapping.mapped, null, 2));
  }

  if (smoke.tables_probed?.length) {
    console.log(
      'tables_probed:',
      smoke.tables_probed.map((t) => ({
        table: t.table,
        ok: t.ok,
        total_count: t.total_count,
      })),
    );
  }

  if (smoke.error) {
    console.warn(`warning: ${smoke.error}`);
  }

  process.exit(smoke.connected ? 0 : 2);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
