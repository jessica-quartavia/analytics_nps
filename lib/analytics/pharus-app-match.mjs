export function isValidCpfDigits(d) {
  if (!/^\d{11}$/.test(d)) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

export function normalizeCpf(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  let cpf = '';
  if (d.length === 11) cpf = d;
  else if (d.length === 14) cpf = d.slice(0, 11);
  else if (d.length > 11) cpf = d.slice(-11);
  return cpf && isValidCpfDigits(cpf) ? cpf : '';
}

export function normalizeEmail(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s.includes('@') ? s : '';
}

export function normalizePhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  return d.length >= 10 ? d : '';
}

/** Chaves para indexação (DDD+número e variantes com/sem 55). */
export function phoneMatchKeys(v) {
  const primary = normalizePhone(v);
  const keys = new Set();
  if (!primary) return [];
  keys.add(primary);
  if (primary.length >= 10) keys.add(primary.slice(-10));
  if (primary.length >= 11) keys.add(primary.slice(-11));
  return [...keys];
}

function pickField(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return row[k];
  }
  return null;
}

export function extractAppRecordFields(row) {
  return {
    app_user_id: pickField(row, ['id', 'user_id', 'uuid']),
    cpf: normalizeCpf(pickField(row, ['cpf', 'document', 'documento', 'cpf_cnpj'])),
    email: normalizeEmail(
      pickField(row, ['email', 'e_mail', 'user_email', 'alternative_email']),
    ),
    phone: normalizePhone(
      pickField(row, ['phone', 'telefone', 'mobile', 'celular', 'phone_number']),
    ),
    registered_at: pickField(row, ['created_at', 'registered_at', 'signup_at', 'updated_at']),
  };
}

/**
 * @param {Array<{ client_id: string, cpf?: string, email?: string, phone?: string }>} baseClients
 * @param {Array<object>} appRecords normalized via extractAppRecordFields
 */
export function matchClientsToApp(baseClients, appRecords) {
  const byCpf = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  for (const rec of appRecords) {
    if (rec.cpf) {
      if (!byCpf.has(rec.cpf)) byCpf.set(rec.cpf, []);
      byCpf.get(rec.cpf).push(rec);
    }
    if (rec.email) {
      if (!byEmail.has(rec.email)) byEmail.set(rec.email, []);
      byEmail.get(rec.email).push(rec);
    }
    for (const pk of phoneMatchKeys(rec.phone)) {
      if (!byPhone.has(pk)) byPhone.set(pk, []);
      byPhone.get(pk).push(rec);
    }
  }

  const entries = [];
  const audit = {
    match_by_cpf: 0,
    match_by_email: 0,
    match_by_phone: 0,
    match_by_multiple: 0,
    ambiguous_clients: 0,
    unmatched_clients: 0,
    insufficient_identifiers: 0,
    matched_clients: 0,
  };

  for (const c of baseClients) {
    const cpf = normalizeCpf(c.cpf);
    const email = normalizeEmail(c.email);
    const phone = normalizePhone(c.phone);
    if (!cpf && !email && !phone) {
      audit.insufficient_identifiers += 1;
      entries.push({
        client_id: c.client_id,
        has_app: false,
        app_match: false,
        app_match_status: 'insufficient_identifiers',
        app_match_method: 'none',
        app_registered_at: null,
      });
      continue;
    }

    const hits = new Map();
    const methods = new Set();
    function addHits(list, method) {
      for (const r of list ?? []) {
        hits.set(r.app_user_id ?? JSON.stringify(r), r);
        methods.add(method);
      }
    }
    if (cpf) addHits(byCpf.get(cpf), 'cpf');
    if (email) addHits(byEmail.get(email), 'email');
    for (const pk of phoneMatchKeys(phone)) addHits(byPhone.get(pk), 'phone');

    const uniqueUsers = new Set(
      [...hits.values()].map((r) => r.app_user_id ?? `${r.email}|${r.cpf}|${r.phone}`),
    );

    if (uniqueUsers.size > 1) {
      audit.ambiguous_clients += 1;
      entries.push({
        client_id: c.client_id,
        has_app: false,
        app_match: false,
        app_match_conflict: true,
        app_match_status: 'ambiguous',
        app_match_method: 'conflict',
        app_registered_at: null,
      });
      continue;
    }

    if (hits.size === 0) {
      audit.unmatched_clients += 1;
      entries.push({
        client_id: c.client_id,
        has_app: false,
        app_match: false,
        app_match_status: 'unmatched',
        app_match_method: 'none',
        app_registered_at: null,
      });
      continue;
    }

    audit.matched_clients += 1;
    const rec = [...hits.values()][0];
    let method = 'cpf';
    if (methods.size > 1) {
      method = 'multiple';
      audit.match_by_multiple += 1;
    } else if (methods.has('email')) {
      method = 'email';
      audit.match_by_email += 1;
    } else if (methods.has('phone')) {
      method = 'phone';
      audit.match_by_phone += 1;
    } else {
      audit.match_by_cpf += 1;
    }

    entries.push({
      client_id: c.client_id,
      has_app: true,
      app_match: true,
      app_match_status: 'matched',
      app_match_method: method,
      app_registered_at: rec.registered_at ?? null,
    });
  }

  return { entries, audit };
}

/** Entrada pública — sem PII. */
export function toPublicPharusMatchEntry(e) {
  const conflict = e.app_match_conflict === true || e.app_match_status === 'ambiguous';
  const appMatch = conflict ? false : e.app_match === true || e.has_app === true;
  let method = e.app_match_method ?? 'none';
  if (conflict) method = 'conflict';
  else if (e.app_match_status === 'insufficient_identifiers') method = 'insufficient';
  else if (appMatch && !method) method = 'cpf';
  else if (!appMatch && method === 'none' && e.app_match_status === 'unmatched') method = 'none';
  const out = {
    client_id: e.client_id,
    app_match: appMatch,
    app_match_method: method,
  };
  if (conflict) out.app_match_conflict = true;
  return out;
}

/** Expande entrada pública para campos usados no dashboard. */
export function expandPharusMatchEntry(entry) {
  if (!entry) {
    return {
      app_match: null,
      has_app: null,
      has_app_access: null,
      app_match_status: 'not_found',
      app_match_method: null,
      app_match_conflict: false,
    };
  }
  const conflict = entry.app_match_conflict === true || entry.app_match_method === 'conflict';
  const appMatch =
    entry.app_match === true || (entry.has_app === true && !conflict);
  if (conflict) {
    return {
      app_match: false,
      has_app: false,
      has_app_access: false,
      app_match_status: 'ambiguous',
      app_match_method: entry.app_match_method ?? 'conflict',
      app_match_conflict: true,
    };
  }
  if (
    entry.app_match_status === 'insufficient_identifiers' ||
    entry.app_match_method === 'insufficient'
  ) {
    return {
      app_match: false,
      has_app: false,
      has_app_access: false,
      app_match_status: 'insufficient_identifiers',
      app_match_method: 'insufficient',
      app_match_conflict: false,
    };
  }
  if (appMatch) {
    return {
      app_match: true,
      has_app: true,
      has_app_access: true,
      app_match_status: 'matched',
      app_match_method: entry.app_match_method ?? null,
      app_match_conflict: false,
    };
  }
  return {
    app_match: false,
    has_app: false,
    has_app_access: false,
    app_match_status: entry.app_match_status ?? 'unmatched',
    app_match_method: entry.app_match_method === 'none' ? null : entry.app_match_method,
    app_match_conflict: false,
  };
}
