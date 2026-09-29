import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatNps, formatPct } from '../utils/format.js';

/** Célula numérica: contagem de clientes (sem prefixo n=). */
export function cellClients(n) {
  const v = n ?? 0;
  return `<td class="num"><span class="cell-primary">${escapeHtml(String(v))}</span></td>`;
}

/** Percentual + denominador em duas linhas. */
export function cellPctStack(pct, n, unit = 'clientes') {
  const primary = pct != null ? formatPct(pct, 1) : '—';
  const meta =
    n != null && n > 0 ?
      `${escapeHtml(String(n))} ${escapeHtml(unit)}`
    : `<span class="cell-stack__meta">—</span>`;
  return `<td class="num cell-stack">
    <span class="cell-stack__primary">${escapeHtml(primary)}</span>
    <span class="cell-stack__meta">${meta}</span>
  </td>`;
}

/** NPS com IC95 em linha secundária (evita quebra na mesma linha). */
export function cellNpsStack(nps, ciLow, ciHigh) {
  const primary = nps != null ? formatNps(nps) : '—';
  let sub = '';
  if (ciLow != null && ciHigh != null) {
    sub = `<span class="cell-stack__sub">IC95 ${escapeHtml(formatNps(ciLow))}–${escapeHtml(formatNps(ciHigh))}</span>`;
  }
  return `<td class="num cell-stack">
    <span class="cell-stack__primary">${escapeHtml(primary)}</span>
    ${sub}
  </td>`;
}

export function cellPlainNum(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '<td class="num">—</td>';
  const s = typeof value === 'number' ? value.toFixed(digits) : String(value);
  return `<td class="num"><span class="cell-primary">${escapeHtml(s)}</span></td>`;
}

/** Marco P/N/D: percentual clicável + contagem (denom opcional = total da categoria NPS). */
export function marcoCellHtml(pct, n, attrs = '', denom = null) {
  const primary = pct != null ? formatPct(pct, 1) : '—';
  const meta =
    denom != null && n != null ? `${n} de ${denom}` : n != null ? `${n} clientes` : '—';
  const tip =
    denom != null && n != null ? ` title="${escapeAttr(`${n} de ${denom} clientes`)}"` : '';
  return `<td class="num cell-stack">
    <button type="button" class="cell-stack__drill milestone-drill" ${attrs}${tip} aria-label="Ver clientes">
      <span class="cell-stack__primary">${escapeHtml(primary)}</span>
      <span class="cell-stack__meta">${escapeHtml(meta)}</span>
    </button>
  </td>`;
}

export function fmtMoneyShort(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000) return `R$ ${Math.round(n / 1_000).toLocaleString('pt-BR')} mil`;
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}
