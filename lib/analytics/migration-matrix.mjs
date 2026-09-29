const CATEGORIES = ['Detrator', 'Neutro', 'Promotor'];

const CELL_KEYS = [];
for (const from of CATEGORIES) {
  for (const to of CATEGORIES) {
    CELL_KEYS.push(`${from} -> ${to}`);
  }
}

/**
 * Matriz 3×3 de migração NPS entre dois ciclos analíticos consecutivos (base pareada).
 * @param {string} previousCycleCode
 * @param {string} currentCycleCode
 * @param {Array<{ client_id: string, analytical_cycle_code: string, nps_category: string }>} responses
 */
export function buildMigrationMatrix(previousCycleCode, currentCycleCode, responses) {
  const byClient = new Map();
  for (const r of responses) {
    if (!r.client_id) continue;
    if (r.analytical_cycle_code !== previousCycleCode && r.analytical_cycle_code !== currentCycleCode) {
      continue;
    }
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, {});
    byClient.get(r.client_id)[r.analytical_cycle_code] = r.nps_category;
  }

  const counts = Object.fromEntries(CELL_KEYS.map((k) => [k, 0]));
  let paired = 0;

  for (const [, cats] of byClient) {
    const prev = cats[previousCycleCode];
    const curr = cats[currentCycleCode];
    if (!prev || !curr) continue;
    paired++;
    const key = `${prev} -> ${curr}`;
    counts[key]++;
  }

  const originTotals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const [, cats] of byClient) {
    const prev = cats[previousCycleCode];
    const curr = cats[currentCycleCode];
    if (!prev || !curr) continue;
    originTotals[prev]++;
  }

  const cells = CELL_KEYS.map((key) => {
    const count = counts[key];
    const from = key.split(' -> ')[0];
    const pct_of_origin = originTotals[from] ? (count / originTotals[from]) * 100 : 0;
    return { key, count, pct_of_origin };
  });

  return {
    previous_cycle: previousCycleCode,
    current_cycle: currentCycleCode,
    paired_clients: paired,
    cells,
  };
}
