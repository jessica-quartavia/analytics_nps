/**
 * Exportação CSV respeitando recorte atual (sem PII sensível).
 */

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(columns, rows) {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','),
  );
  return [header, ...lines].join('\r\n');
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob(['\ufeff', csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFilteredCsv({ filename, columns, rows }) {
  if (!rows?.length) return { ok: false, reason: 'empty' };
  downloadCsv(filename, rowsToCsv(columns, rows));
  return { ok: true, rows: rows.length };
}
