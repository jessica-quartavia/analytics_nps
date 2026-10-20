/** Formatação de labels sobre barras/pontos (Chart.js). */
export function formatChartLabelValue(value, kind = 'count') {
  if (value == null || value === '' || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  switch (kind) {
    case 'nps':
      return n.toFixed(1).replace('.', ',');
    case 'pct':
      return `${n.toFixed(1).replace('.', ',')}%`;
    case 'mean':
      return n.toFixed(2).replace('.', ',');
    case 'count':
    default:
      return String(Math.round(n));
  }
}

let labelPluginSeq = 0;

/**
 * Plugin Chart.js — valor acima de pontos (linha) ou topo de barras.
 * @param {object} opts
 * @param {(index: number, chart: import('chart.js').Chart) => unknown} opts.getValue
 * @param {'nps'|'pct'|'count'|'mean'} [opts.formatKind]
 * @param {(raw: unknown, index: number) => string|null} [opts.formatValue]
 * @param {boolean} [opts.showAll]
 * @param {boolean} [opts.showLast]
 * @param {boolean} [opts.showMinMax]
 * @param {boolean} [opts.barTop] — barras verticais (label acima da barra)
 * @param {number} [opts.offsetY]
 */
export function buildValueLabelPlugin(opts = {}) {
  const {
    getValue,
    formatKind = 'count',
    formatValue,
    showAll = true,
    showLast = false,
    showMinMax = false,
    barTop = false,
    horizontalBarEnd = false,
    offsetY = 10,
  } = opts;
  const id = opts.id ?? `valueLabels-${++labelPluginSeq}`;

  return {
    id,
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;
      const { ctx } = chart;
      const values = meta.data.map((_, i) => {
        const raw = getValue(i, chart);
        return raw == null || Number.isNaN(Number(raw)) ? null : Number(raw);
      });
      const numeric = values.filter((v) => v != null);
      let minIdx = -1;
      let maxIdx = -1;
      if (showMinMax && numeric.length) {
        const min = Math.min(...numeric);
        const max = Math.max(...numeric);
        minIdx = values.indexOf(min);
        maxIdx = values.indexOf(max);
      }
      const lastIdx = values.length - 1;

      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(51, 65, 85, 0.92)';
      ctx.textAlign = 'center';

      for (let i = 0; i < meta.data.length; i += 1) {
        if (!showAll) {
          if (showLast && i !== lastIdx) continue;
          if (showMinMax && i !== minIdx && i !== maxIdx) continue;
          if (!showLast && !showMinMax) continue;
        }
        const raw = getValue(i, chart);
        const label = formatValue
          ? formatValue(raw, i)
          : formatChartLabelValue(raw, formatKind);
        if (label == null) continue;
        const pt = meta.data[i];
        if (!pt) continue;
        let x = pt.x;
        let y = pt.y - offsetY;
        if (horizontalBarEnd && chart.config.options?.indexAxis === 'y') {
          x = Math.max(pt.x, pt.base) + 6;
          y = pt.y + 4;
          ctx.textAlign = 'left';
        }
        ctx.fillText(label, x, y);
      }
      ctx.restore();
    },
  };
}

export function measurementSeriesTooltipCallbacks(series) {
  return {
    title(items) {
      const i = items[0]?.dataIndex;
      const row = series[i];
      return row ? `Medição ${row.measurement}` : '';
    },
    label(ctx) {
      const row = series[ctx.dataIndex];
      return row?.nps != null ? `NPS: ${Number(row.nps).toFixed(1).replace('.', ',')}` : 'NPS: —';
    },
    afterBody(items) {
      const i = items[0]?.dataIndex;
      const row = series[i];
      if (!row) return [];
      return [
        `Respostas: ${row.responses ?? '—'}`,
        `Clientes únicos: ${row.distinct_clients ?? '—'}`,
        `Promotores: ${row.promoters ?? '—'}`,
        `Neutros: ${row.neutrals ?? '—'}`,
        `Detratores: ${row.detractors ?? '—'}`,
        row.source_label ? `Fonte: ${row.source_label}` : '',
      ].filter(Boolean);
    },
  };
}

export function npsScaleBounds(series) {
  const npsPlotted = (series ?? []).map((r) => r.nps).filter((v) => v != null && !Number.isNaN(v));
  const yMin = npsPlotted.length && Math.min(...npsPlotted) < 0 ? -100 : 0;
  return { yMin, yMax: 100 };
}

export const MEASUREMENT_NPS_LINE_COLORS = {
  border: '#c44a2a',
  fill: 'rgba(196, 74, 42, 0.12)',
};
