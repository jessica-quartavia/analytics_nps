import { createClient } from '@supabase/supabase-js';
import { extractAppRecordFields } from '../analytics/pharus-app-match.mjs';

const SCHEMAS = ['core', 'public', 'app'];
const TABLE_CANDIDATES = [
  'personal_info',
  'profiles',
  'users',
  'user_profiles',
  'app_users',
  'customers',
  'clientes',
];

const CADASTRO_SCORE_FIELDS = [
  'cpf',
  'document',
  'documento',
  'email',
  'phone',
  'telefone',
  'user_id',
  'created_at',
];

function scoreRowKeys(keys) {
  const lower = new Set(keys.map((k) => String(k).toLowerCase()));
  let score = 0;
  for (const f of CADASTRO_SCORE_FIELDS) {
    if ([...lower].some((k) => k.includes(f))) score += 1;
  }
  return score;
}

function columnMappingFromSample(row) {
  if (!row || typeof row !== 'object') return {};
  const keys = Object.keys(row);
  const pick = (candidates) => candidates.find((c) => keys.includes(c)) ?? null;
  return {
    table_columns: keys.sort(),
    mapped: {
      user_id: pick(['id', 'user_id', 'uuid', 'profile_id']),
      cpf: pick(['cpf', 'document', 'documento', 'cpf_cnpj', 'cpf_norm']),
      email: pick(['email', 'e_mail', 'user_email', 'email_norm', 'alternative_email']),
      phone: pick(['phone', 'telefone', 'mobile', 'celular', 'phone_number', 'telefone_norm']),
      name: pick(['name', 'full_name', 'nome', 'display_name']),
      created_at: pick(['created_at', 'registered_at', 'signup_at']),
      updated_at: pick(['updated_at', 'modified_at']),
    },
  };
}

function createPharusClient(cfg, schema = 'public') {
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema },
  });
}

async function listAuthUsers(sb) {
  const byId = new Map();
  let page = 1;
  while (page <= 50) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users ?? []) byId.set(u.id, u);
    if ((data.users ?? []).length < 1000) break;
    page += 1;
  }
  return byId;
}

async function probeTables(cfg) {
  const tables_probed = [];
  let best = null;

  for (const schema of SCHEMAS) {
    const sb = createPharusClient(cfg, schema);
    for (const table of TABLE_CANDIDATES) {
      const { data, error, count } = await sb
        .from(table)
        .select('*', { count: 'exact', head: false })
        .limit(3);
      tables_probed.push({
        schema,
        table,
        ok: !error,
        error: error?.message ?? null,
        sample_count: data?.length ?? 0,
        total_count: typeof count === 'number' ? count : null,
      });
      if (error || !data?.length) continue;
      const score = scoreRowKeys(Object.keys(data[0]));
      const total = typeof count === 'number' ? count : data.length;
      const candidate = { schema, table, score, sample: data[0], total };
      if (
        !best ||
        candidate.score > best.score ||
        (candidate.score === best.score && candidate.total > best.total)
      ) {
        best = candidate;
      }
    }
  }
  return { tables_probed, best };
}

async function fetchPersonalInfoWithAuth(cfg, best) {
  const sbCore = createPharusClient(cfg, best.schema);
  const { data: rows, error } = await sbCore.from(best.table).select('*').limit(50000);
  if (error || !rows?.length) {
    return {
      records: [],
      error: error?.message ?? 'SELECT vazio',
      column_mapping: columnMappingFromSample(best.sample),
    };
  }

  const sbAuth = createPharusClient(cfg, 'public');
  let authById;
  try {
    authById = await listAuthUsers(sbAuth);
  } catch (e) {
    authById = new Map();
    console.warn('[pharus-app] auth.admin.listUsers:', e.message ?? e);
  }

  const records = rows.map((row) => {
    const uid = row.user_id ?? row.id;
    const auth = uid ? authById.get(uid) : null;
    return extractAppRecordFields({
      ...row,
      id: uid,
      email: auth?.email ?? row.alternative_email ?? row.email,
      phone: row.phone ?? auth?.phone,
      created_at: auth?.created_at ?? row.created_at,
    });
  });

  return {
    records,
    error: null,
    column_mapping: {
      ...columnMappingFromSample(best.sample),
      auth_email_source: 'auth.admin.listUsers',
    },
  };
}

/**
 * Descobre tabela de cadastro e retorna registros normalizados (SELECT only).
 */
export async function fetchPharusAppCadastro(cfg) {
  if (!cfg.configured) {
    return {
      records: [],
      source: 'not_configured',
      error: 'PHARUS env ausente',
      column_mapping: null,
      tables_probed: [],
      configured: false,
    };
  }

  const { tables_probed, best } = await probeTables(cfg);

  if (!best) {
    return {
      records: [],
      source: 'no_table',
      error: 'Nenhuma tabela App com dados',
      column_mapping: null,
      tables_probed,
      configured: true,
    };
  }

  const pack = await fetchPersonalInfoWithAuth(cfg, best);
  return {
    records: pack.records,
    source: `${best.schema}.${best.table}`,
    error: pack.error,
    column_mapping: pack.column_mapping,
    tables_probed,
    configured: true,
    app_records_count: pack.records.length,
  };
}

export async function smokePharusConnection(cfg) {
  const result = await fetchPharusAppCadastro(cfg);
  return {
    connected: result.records.length > 0,
    source: result.source,
    app_records: result.records.length,
    column_mapping: result.column_mapping,
    tables_probed: result.tables_probed,
    error: result.error,
  };
}
