import {
  buildValueLabelPlugin,
  measurementSeriesTooltipCallbacks,
  npsScaleBounds,
  MEASUREMENT_NPS_LINE_COLORS,
} from './chart-value-labels.mjs';

export const CHART_EMPTY_MESSAGE = 'Sem dados para este recorte.';

export function showChartEmptyState(wrapEl, message = CHART_EMPTY_MESSAGE) {
  if (!wrapEl) return;
  const canvas = wrapEl.querySelector('canvas');
  if (canvas) canvas.hidden = true;
  let note = wrapEl.querySelector('[data-chart-empty]');
  if (!note) {
    note = document.createElement('p');
    note.className = 'chart-empty-state note-muted';
    note.dataset.chartEmpty = '1';
    wrapEl.appendChild(note);
  }
  note.hidden = false;
  note.textContent = message;
}

export function clearChartEmptyState(wrapEl) {
  if (!wrapEl) return;
  const canvas = wrapEl.querySelector('canvas');
  if (canvas) canvas.hidden = false;
  const note = wrapEl.querySelector('[data-chart-empty]');
  if (note) note.hidden = true;
}

function baseChartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 28, bottom: 4 } },
    ...extra,
  };
}

/** Gráfico linha — NPS por medição (paridade Histórico × Safras). */
export function mountMeasurementNpsLineChart({
  ChartRef,
  canvas,
  series,
  chartInstances,
  extraPlugins = [],
}) {
  const wrap = canvas?.closest('.chart-wrap');
  if (!canvas || !ChartRef) return null;
  const rows = (series ?? []).filter((r) => r?.measurement);
  if (!rows.length) {
    showChartEmptyState(wrap);
    return null;
  }
  clearChartEmptyState(wrap);

  const { yMin, yMax } = npsScaleBounds(rows);
  const npsLabelPlugin = buildValueLabelPlugin({
    getValue: (i) => rows[i]?.nps,
    formatKind: 'nps',
  });

  const chart = new ChartRef(canvas, {
    type: 'line',
    data: {
      labels: rows.map((r) => r.measurement),
      datasets: [
        {
          label: 'NPS',
          data: rows.map((r) => r.nps),
          borderColor: MEASUREMENT_NPS_LINE_COLORS.border,
          backgroundColor: MEASUREMENT_NPS_LINE_COLORS.fill,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
          spanGaps: false,
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: measurementSeriesTooltipCallbacks(rows) },
      },
      scales: {
        y: {
          min: yMin,
          max: yMax,
          grace: '10%',
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
        },
        x: { grid: { display: false } },
      },
    }),
    plugins: [npsLabelPlugin, ...extraPlugins],
  });
  chartInstances?.push(chart);
  return chart;
}

/** Gráfico linha — respostas por medição. */
export function mountMeasurementResponsesLineChart({
  ChartRef,
  canvas,
  series,
  chartInstances,
  colors,
}) {
  const wrap = canvas?.closest('.chart-wrap');
  if (!canvas || !ChartRef) return null;
  const rows = (series ?? []).filter((r) => r?.measurement);
  if (!rows.length) {
    showChartEmptyState(wrap);
    return null;
  }
  clearChartEmptyState(wrap);

  const respLabelPlugin = buildValueLabelPlugin({
    getValue: (i) => rows[i]?.responses,
    formatKind: 'count',
  });

  const chart = new ChartRef(canvas, {
    type: 'line',
    data: {
      labels: rows.map((r) => r.measurement),
      datasets: [
        {
          label: 'Respostas',
          data: rows.map((r) => r.responses),
          borderColor: colors?.line ?? 'rgba(59, 130, 246, 1)',
          backgroundColor: colors?.fill ?? 'rgba(59, 130, 246, 0.12)',
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              const i = items[0]?.dataIndex;
              return rows[i] ? `Medição ${rows[i].measurement}` : '';
            },
            label(ctx) {
              const row = rows[ctx.dataIndex];
              if (!row) return '';
              return [
                `Respostas válidas: ${row.responses ?? '—'}`,
                `Clientes únicos: ${row.distinct_clients ?? '—'}`,
                row.nps != null
                  ? `NPS: ${Number(row.nps).toFixed(1).replace('.', ',')}`
                  : '',
              ].filter(Boolean);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grace: '10%',
          ticks: { precision: 0 },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
        },
        x: { grid: { display: false } },
      },
    }),
    plugins: [respLabelPlugin],
  });
  chartInstances?.push(chart);
  return chart;
}

/** Barras verticais com label no topo (% ou contagem). */
export function mountVerticalBarChart({
  ChartRef,
  canvas,
  labels,
  values,
  chartInstances,
  formatKind = 'count',
  yMax,
  yTickFormat,
  barColor = '#e85d3a',
}) {
  const wrap = canvas?.closest('.chart-wrap');
  if (!canvas || !ChartRef || !labels?.length) {
    showChartEmptyState(wrap);
    return null;
  }
  clearChartEmptyState(wrap);

  const barLabels = buildValueLabelPlugin({
    getValue: (i) => values[i],
    formatKind,
    barTop: true,
    offsetY: 6,
  });

  const chart = new ChartRef(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: barColor,
          borderRadius: 4,
        },
      ],
    },
    options: baseChartOptions({
      plugins: { legend: { display: false } },
      scales: {
        y: {
          max: yMax,
          grace: '10%',
          ticks: yTickFormat ? { callback: yTickFormat } : undefined,
        },
      },
    }),
    plugins: [barLabels],
  });
  chartInstances?.push(chart);
  return chart;
}
