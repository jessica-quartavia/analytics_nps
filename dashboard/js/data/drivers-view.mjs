/** Apresentação gerencial de drivers (sem alterar testes estatísticos). */

export const DRIVER_LABELS = {
  meetings_count: 'Quantidade de reuniões',
  meetings_last_90d: 'Reuniões nos últimos 90 dias',
  tenure_months: 'Tempo de relacionamento',
  positive_topics_count: 'Temas positivos mencionados',
  negative_topics_count: 'Temas negativos mencionados',
  mechanisms_count: 'Quantidade de mecanismos',
};

export function driverFriendlyName(technical) {
  return DRIVER_LABELS[technical] ?? technical ?? '—';
}

export function qualityFriendlyLabel(quality) {
  const map = {
    point_in_time: 'Boa',
    good: 'Boa',
    high: 'Boa',
    complete: 'Boa',
    current_proxy: 'Proxy atual',
    partial: 'Parcial',
    unavailable: 'Indisponível',
  };
  return map[quality] ?? quality ?? '—';
}

export function qualityBadgeClass(quality) {
  if (quality === 'unavailable') return 'badge--muted';
  if (quality === 'current_proxy' || quality === 'partial') return 'badge--warn';
  return 'badge--ok';
}

/** false = não entra no ranking principal */
export function eligibleForDriverRanking(test) {
  return classifyDriverPresentation(test) === 'ranking';
}

export function classifyDriverPresentation(test) {
  const q = test?.feature_quality;
  if (q === 'unavailable') return 'insufficient';
  if (q === 'current_proxy' || q === 'partial') return 'caveat';
  return 'ranking';
}

export function formatPAdjusted(p) {
  if (p == null || Number.isNaN(p)) return '—';
  if (p < 0.001) return 'p ajustado < 0,001';
  return `p ajustado ${Number(p).toLocaleString('pt-BR', { maximumSignificantDigits: 3 })}`;
}

export function formatEffectLabel(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.includes('forte')) return 'Forte';
  if (s.includes('moder')) return 'Moderado';
  if (s.includes('fraco') || s.includes('weak')) return 'Fraco';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function partitionDriverTests(tests) {
  const ranking = [];
  const caveat = [];
  const insufficient = [];
  for (const t of tests ?? []) {
    const tier = classifyDriverPresentation(t);
    if (tier === 'ranking') ranking.push(t);
    else if (tier === 'caveat') caveat.push(t);
    else insufficient.push(t);
  }
  const byRelevance = (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
  ranking.sort(byRelevance);
  caveat.sort(byRelevance);
  insufficient.sort(byRelevance);
  return { ranking, caveat, insufficient };
}

export function driverInterpretation(test) {
  const name = driverFriendlyName(test.driver);
  const dir =
    test.effect_size != null && test.effect_size >= 0
      ? 'valores maiores desta variável foram associados a notas maiores'
      : 'valores maiores desta variável foram associados a notas menores';
  return `Na amostra analisada, ${dir} (${name}).`;
}
