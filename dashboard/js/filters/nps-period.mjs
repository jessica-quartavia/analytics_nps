const NPS_PERIOD_ROUTES = new Set([
  'executivo',
  'movimento',
  'eps',
  'voz-do-cliente',
  'jornada-perfil',
  'drivers',
  'plano-de-acao',
]);

export function showNpsPeriodFilter(route) {
  return NPS_PERIOD_ROUTES.has(route);
}

export function filterNpsAllPeriods(rows, npsPeriod) {
  if (!rows?.length || !npsPeriod || npsPeriod === 'all') return rows ?? [];
  if (npsPeriod === 'base0') return rows.filter((r) => r.source === 'base0');
  if (npsPeriod === 'current') return rows.filter((r) => r.source === 'current');
  return rows.filter((r) => r.period === npsPeriod || r.cycle === npsPeriod);
}

export function buildNpsPeriodSelectOptions() {
  return [
    { value: 'all', label: 'Todos' },
    { value: 'base0', label: 'NPS passado' },
    { value: 'current', label: 'NPS atual' },
  ];
}
