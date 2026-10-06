import { createClient } from '@supabase/supabase-js';
import {
  assertBusinessDataProject,
  loadBusinessDataSupabaseConfig,
} from './voc-supabase-config.mjs';

/** Cliente PostgREST Business Data (rckp). Nunca logar service role. */
export function createBusinessDataClient(schema = 'base0') {
  const cfg = loadBusinessDataSupabaseConfig();
  assertBusinessDataProject(cfg);
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema },
  });
}
