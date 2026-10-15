import { aggregateMeasurementsFromIndex } from '../../../lib/analytics/nps-historico-measurements.mjs';

/** Série do gráfico "Respostas por medição" a partir do pack materializado. */
export function buildMeasurementChartSeries(measurementsPack, filteredClients) {
  const index = measurementsPack?.response_index ?? [];
  const series = aggregateMeasurementsFromIndex(
    index,
    new Set((filteredClients ?? []).map((c) => c.client_id).filter(Boolean)),
  );
  return series.map((row) => ({
    measurement: row.measurement,
    responses: row.valid_responses,
    distinct_clients: row.distinct_clients,
    promoters: row.promoters,
    neutrals: row.neutrals,
    detractors: row.detractors,
    nps: row.nps,
  }));
}
