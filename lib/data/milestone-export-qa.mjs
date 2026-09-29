import { parseTs } from '../analytics/milestone-temporal.mjs';

const TIMESTAMP_FIELDS = [
  'start_time',
  'implemented_at',
  'requested_at',
  'created_at',
  'churn_at',
  'effective_at',
  'data_efetiva',
  'data_inicio_congelamento',
  'data_pedido',
  'churn_efetivado_at',
  'intencao_registrada_at',
  'recorded_at',
  'contact_at',
];

function rowTimestamp(row) {
  for (const f of TIMESTAMP_FIELDS) {
    if (row[f] != null && row[f] !== '') return row[f];
  }
  return null;
}

/** QA por arquivo exportado (array de linhas). */
export function qaExportedSource(rows, { name, clientIdField = 'client_id' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const clients = new Set();
  let missingClientId = 0;
  let missingTimestamp = 0;
  const dates = [];

  for (const row of list) {
    const cid = row[clientIdField];
    if (!cid) missingClientId++;
    else clients.add(cid);
    const ts = rowTimestamp(row);
    if (!ts) missingTimestamp++;
    else {
      const t = parseTs(ts);
      if (t != null) dates.push(t);
    }
  }

  dates.sort((a, b) => a - b);
  return {
    source: name,
    rows: list.length,
    distinct_clients: clients.size,
    min_date: dates.length ? new Date(dates[0]).toISOString() : null,
    max_date: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
    missing_client_id: missingClientId,
    missing_timestamp: missingTimestamp,
  };
}

export function buildMilestoneExportQaDoc(sourceMap) {
  const sources = {};
  for (const [file, rows] of Object.entries(sourceMap)) {
    sources[file] = qaExportedSource(rows, { name: file });
  }
  return {
    generated_at: new Date().toISOString(),
    sources,
  };
}
