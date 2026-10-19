import { buildPairedCycleMetrics } from './paired-cycles.mjs';
import { dedupeLatestNpsByClient, isValidScore } from './nps.mjs';

/**
 * Clientes com resposta válida em ambos os ciclos analíticos consecutivos.
 */
export function auditPairedClientsBetweenCycles(previousCycleCode, currentCycleCode, responses) {
  const metrics = buildPairedCycleMetrics(previousCycleCode, currentCycleCode, responses);
  const prevClients = clientsWithValidResponseInCycle(responses, previousCycleCode);
  const currClients = clientsWithValidResponseInCycle(responses, currentCycleCode);
  const pairedSet = new Set(metrics.paired_client_ids);
  return {
    previous_cycle: previousCycleCode,
    current_cycle: currentCycleCode,
    previous_n: prevClients.size,
    current_n: currClients.size,
    previous_clients: prevClients.size,
    current_clients: currClients.size,
    intersection: pairedSet.size,
    paired_n: metrics.paired_clients,
    paired_total: metrics.paired_clients,
    paired_client_ids: metrics.paired_client_ids,
    definition:
      'Pareado = client_id com resposta NPS válida (dedupe: última por ciclo) no ciclo anterior e no ciclo atual.',
  };
}

/**
 * Recorrentes Histórico 2: clientes com 2+ linhas no enriched PIT (qualquer medição).
 */
export function countRecurringFromEnrichedRows(enrichedRows) {
  const map = new Map();
  for (const r of enrichedRows ?? []) {
    if (!r.client_id) continue;
    map.set(r.client_id, (map.get(r.client_id) ?? 0) + 1);
  }
  const recurringIds = [...map.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  return {
    unique_clients: map.size,
    recurring_clients: recurringIds.length,
    recurring_client_ids: recurringIds,
    definition:
      'Recorrente (NPS Histórico KPI) = 2+ respostas no recorte enriched PIT — não limitado ao par de ciclos atual.',
  };
}

export function diffClientIdSets(setA, setB) {
  const a = setA instanceof Set ? setA : new Set(setA ?? []);
  const b = setB instanceof Set ? setB : new Set(setB ?? []);
  const inBoth = [];
  const onlyA = [];
  const onlyB = [];
  for (const id of a) {
    if (b.has(id)) inBoth.push(id);
    else onlyA.push(id);
  }
  for (const id of b) {
    if (!a.has(id)) onlyB.push(id);
  }
  return { in_both: inBoth.length, only_a: onlyA.length, only_b: onlyB.length, only_a_ids: onlyA, only_b_ids: onlyB };
}

/** Respostas válidas por ciclo (dedupe client_id dentro do ciclo). */
export function clientsWithValidResponseInCycle(responses, cycleCode) {
  const inCycle = (responses ?? []).filter(
    (r) => r.analytical_cycle_code === cycleCode && r.client_id && isValidScore(r.score),
  );
  const deduped = dedupeLatestNpsByClient(inCycle, { requireClientId: true });
  return new Set(deduped.map((r) => r.client_id));
}
