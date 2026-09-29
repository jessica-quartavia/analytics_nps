/**
 * Base pareada: clientes com resposta em ciclos consecutivos (por ordem starts_at).
 * @param {Array<{ client_id: string, cycle_id: string, cycle_starts_at: string|null }>} responses
 * @param {string} cycleIdA
 * @param {string} cycleIdB
 */
export function buildPairedClientIds(responses, cycleIdA, cycleIdB) {
  const byClient = new Map();
  for (const r of responses) {
    if (r.cycle_id !== cycleIdA && r.cycle_id !== cycleIdB) continue;
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, new Set());
    byClient.get(r.client_id).add(r.cycle_id);
  }
  const paired = [];
  for (const [clientId, cycles] of byClient) {
    if (cycles.has(cycleIdA) && cycles.has(cycleIdB)) {
      paired.push(clientId);
    }
  }
  return paired;
}
