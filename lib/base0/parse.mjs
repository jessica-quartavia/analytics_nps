import { createHash } from 'node:crypto';

export function digitsOnly(s) {
  if (s == null) return null;
  const d = String(s).replace(/\D/g, '');
  return d.length ? d : null;
}

export function normEmail(s) {
  if (s == null || !String(s).trim()) return null;
  return String(s).trim().toLowerCase();
}

export function blankToNull(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || t === '-' || t === '—') return null;
  return t;
}

export function parseBoolPt(s) {
  const t = blankToNull(s);
  if (t == null) return null;
  const l = t.toLowerCase();
  if (l === 'sim' || l === 'true' || l === '1') return true;
  if (l === 'não' || l === 'nao' || l === 'false' || l === '0') return false;
  return null;
}

export function parseMoneyBr(s) {
  const t = blankToNull(s);
  if (t == null) return null;
  let x = t.replace(/R\$\s?/gi, '').replace(/\s/g, '');
  if (x.includes(',')) {
    x = x.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function parseDecimalBr(s) {
  const t = blankToNull(s);
  if (t == null) return null;
  const x = t.replace(/\./g, '').replace(',', '.');
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function parseIntSafe(s) {
  const t = blankToNull(s);
  if (t == null) return null;
  const n = parseInt(t.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuid(s) {
  const t = blankToNull(s);
  if (!t) return null;
  return UUID_RE.test(t) ? t.toLowerCase() : null;
}

export function parseDateBr(s) {
  const t = blankToNull(s);
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseDateTimeBr(s) {
  const t = blankToNull(s);
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return parseDateBr(t);
  const iso = parseDateBr(`${m[1]}/${m[2]}/${m[3]}`);
  if (!iso) return null;
  return `${iso}T${String(m[4]).padStart(2, '0')}:${m[5]}:00-03:00`;
}

export function dedupeHash(parts) {
  const raw = parts.map((p) => (p == null ? '' : String(p))).join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export function readCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (c === '\r') i += 1;
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function rowsToObjects(headerRow, dataRows) {
  const headers = headerRow.map((h) => String(h ?? '').trim());
  return dataRows.map((cells) => {
    const o = {};
    headers.forEach((h, i) => {
      if (h) o[h] = cells[i] ?? null;
    });
    return o;
  });
}
