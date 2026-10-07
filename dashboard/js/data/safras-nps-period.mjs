/** Período NPS local — Safras & Cobertura (origem passado vs atual). */

export const SAFRAS_NPS_PERIOD_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'base0', label: 'NPS passado' },
  { value: 'current', label: 'NPS atual' },
];

export function isSafrasPeriodSpecific(npsPeriod) {
  return npsPeriod === 'base0' || npsPeriod === 'current';
}

/** historical = NPS passado (BASE0/CSV); current = medição atual. */
export function historyMatchesSafrasNpsPeriod(row, npsPeriod) {
  if (!npsPeriod || npsPeriod === 'all') return true;
  if (npsPeriod === 'base0') return row.source === 'historical';
  if (npsPeriod === 'current') return row.source === 'current';
  return true;
}

export { formatNpsCycleLabel as friendlyCicloLabel } from '../utils/nps-cycle-labels.mjs';
