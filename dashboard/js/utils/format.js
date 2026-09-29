const npsFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Apresentação — 1 casa decimal; não altera valores no dataset. */
export function formatNps(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return npsFormatter.format(Number(value));
}

const csatFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** CSAT médio (escala 0–5) — apresentação. */
export function formatCsatAverage(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return csatFormatter.format(Number(value));
}

export function formatCsatAverageWithScale(value, max = 5) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${formatCsatAverage(value)} / ${max}`;
}

export function formatPct(value, decimals = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatDeltaPts(current, previous) {
  if (current == null || previous == null) return '—';
  const d = current - previous;
  const sign = d > 0 ? '+' : '';
  return `${sign}${formatNps(d)} pts`;
}

export function formatDeltaValue(delta) {
  if (delta == null || Number.isNaN(delta)) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatNps(delta)} pts`;
}

export function formatNpsRange(low, high) {
  if (low == null || high == null) return '—';
  return `${formatNps(low)} – ${formatNps(high)}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function cycleStatusLabel(status) {
  if (status === 'open') return 'Ciclo parcial';
  if (status === 'partial') return 'Reconstrução parcial';
  if (status === 'closed') return 'Ciclo fechado';
  return status ?? '—';
}
