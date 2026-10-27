const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

function loadXlsx() {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser only'));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-xlsx-cdn]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.XLSX));
      existing.addEventListener('error', () => reject(new Error('xlsx load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.async = true;
    script.dataset.xlsxCdn = '1';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('xlsx load failed'));
    document.head.appendChild(script);
  });
}

function cellValue(col, row) {
  if (typeof col.value === 'function') return col.value(row);
  return row[col.key];
}

/**
 * @param {{ filename: string, sheetName?: string, columns: { header: string, key?: string, value?: Function }[], rows: object[] }} opts
 */
export async function exportFilteredXlsx({ filename, sheetName = 'Clientes', columns, rows }) {
  if (!rows?.length) return { ok: false, reason: 'empty' };
  const XLSX = await loadXlsx();
  const data = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => cellValue(c, row))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
  return { ok: true, rows: rows.length };
}
