const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /service_role[A-Za-z0-9_-]*/gi,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey\s*[:=]\s*\S+/gi,
];

function redactSecrets(text) {
  let s = String(text ?? '');
  for (const re of SECRET_PATTERNS) {
    s = s.replace(re, '[REDACTED]');
  }
  return s;
}

/** @param {unknown} err */
export function serializeError(err) {
  if (err instanceof Error) {
    const out = {
      name: err.name,
      message: redactSecrets(err.message),
      code: err.code ?? undefined,
      details: err.details ?? undefined,
      hint: err.hint ?? undefined,
      status: err.status ?? undefined,
      analyticsCode: err.analyticsCode ?? undefined,
      stage: err.stage ?? undefined,
    };
    if (err.cause) out.cause = serializeError(err.cause);
    return JSON.stringify(out, null, 2);
  }
  if (typeof err === 'string') return redactSecrets(err);
  if (err && typeof err === 'object') {
    try {
      const o = { .../** @type {object} */ (err) };
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string') o[k] = redactSecrets(o[k]);
      }
      return JSON.stringify(o, null, 2);
    } catch {
      return redactSecrets(String(err));
    }
  }
  return redactSecrets(String(err));
}

/**
 * @param {unknown} error PostgREST / Supabase error object
 * @returns {{ analyticsCode: string, message: string }}
 */
export function classifySupabaseError(error) {
  const msg = redactSecrets(String(error?.message ?? error?.error ?? ''));
  const code = String(error?.code ?? '');
  const details = String(error?.details ?? '');
  const hint = String(error?.hint ?? '');
  const status = error?.status ?? error?.statusCode;
  const blob = `${msg} ${details} ${hint} ${code}`.toLowerCase();

  if (status === 401 || /invalid api key|jwt|invalid claim/i.test(blob)) {
    return { analyticsCode: 'ANALYTICS_AUTH_FAILED', message: msg || 'Invalid service role or JWT' };
  }
  if (/permission denied|42501/i.test(blob)) {
    return { analyticsCode: 'ANALYTICS_PERMISSION_DENIED', message: msg || details };
  }
  if (/pgrst106|schema must be one of|could not find the schema|schema.*not exposed/i.test(blob)) {
    return {
      analyticsCode: 'ANALYTICS_SCHEMA_NOT_EXPOSED',
      message: msg || 'Schema analytics_nps may not be in Data API exposed schemas',
    };
  }
  if (/3f000|schema.*does not exist|unknown schema/i.test(blob)) {
    return { analyticsCode: 'ANALYTICS_SCHEMA_MISSING', message: msg || 'Schema analytics_nps missing' };
  }
  if (/42p01|relation.*does not exist|table.*not found/i.test(blob)) {
    return { analyticsCode: 'ANALYTICS_TABLE_MISSING', message: msg || 'VoC table missing — run migration' };
  }
  if (/does not exist|migration|voc_classifier/i.test(blob) && status === 404) {
    return { analyticsCode: 'ANALYTICS_MIGRATION_REQUIRED', message: msg || 'Migration likely not applied' };
  }

  return { analyticsCode: 'ANALYTICS_SUPABASE_ERROR', message: msg || 'Supabase request failed' };
}

/** Evita crash UV_HANDLE_CLOSING no Node 24 (Windows) ao sair com client Supabase aberto. */
/** Agenda exit e impede que main() termine antes (evita UV_HANDLE_CLOSING no Node 24). */
export function exitProcess(code) {
  setTimeout(() => process.exit(code), 50);
  return new Promise(() => {});
}

/**
 * @param {string} context e.g. "voc_responses upsert"
 * @param {unknown} error
 * @param {{ stage?: string }} [meta]
 */
export function throwSupabaseError(context, error, meta = {}) {
  const { analyticsCode, message } = classifySupabaseError(error);
  const e = new Error(`${context}: ${message}`);
  e.name = 'SupabaseAnalyticsError';
  e.analyticsCode = analyticsCode;
  e.stage = meta.stage;
  e.code = error?.code;
  e.details = redactSecrets(error?.details);
  e.hint = error?.hint;
  e.status = error?.status ?? error?.statusCode;
  e.cause = error;
  throw e;
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function validateAnalyticsSupabaseConnection(supabase) {
  const { data, error } = await supabase
    .schema('analytics_nps')
    .from('voc_classifier_versions')
    .select('classifier_version, is_active')
    .limit(1);

  if (error) {
    const { analyticsCode, message } = classifySupabaseError(error);
    const e = new Error(message);
    e.name = 'SupabaseConnectionError';
    e.analyticsCode = analyticsCode;
    e.code = error.code;
    e.details = redactSecrets(error.details);
    e.hint = error.hint;
    e.status = error.status;
    throw e;
  }

  return {
    ok: true,
    sampleRows: data?.length ?? 0,
    hasActiveClassifier: Boolean(data?.some((r) => r.is_active)),
  };
}
