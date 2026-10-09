/**
 * Métricas gerenciais por EP (NPS vs média + Δ pareado).
 */

export const EP_STATUS = {
  STRONG: 'strong',
  ABOVE_FALLING: 'above_falling',
  BELOW_RISING: 'below_rising',
  CRITICAL: 'critical',
  NO_COMPARE: 'no_compare',
};

export function epManagementStatus(entry, overallNps) {
  if (entry.paired_clients <= 0 || entry.delta_nps_paired == null) {
    return { key: EP_STATUS.NO_COMPARE, label: 'Sem comparação histórica', short: '—' };
  }
  const above = entry.nps != null && overallNps != null && entry.nps >= overallNps;
  const delta = entry.delta_nps_paired;
  const improving = delta >= 0;
  if (above && improving) {
    return { key: EP_STATUS.STRONG, label: 'Acima da média e melhorando', short: 'Muito bom' };
  }
  if (above && !improving) {
    return { key: EP_STATUS.ABOVE_FALLING, label: 'Acima da média, mas caiu', short: 'Estável' };
  }
  if (!above && improving) {
    return { key: EP_STATUS.BELOW_RISING, label: 'Abaixo da média, melhorando', short: 'Atenção' };
  }
  return { key: EP_STATUS.CRITICAL, label: 'Abaixo da média e piorando', short: 'Crítico' };
}

/** @param {number|null} delta */
export function formatEpDeltaBadge(delta) {
  if (delta == null || Number.isNaN(delta)) return { text: '—', arrow: '', title: 'Sem comparação histórica' };
  const abs = Math.abs(delta);
  const formatted = abs.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (Math.abs(delta) < 0.05) {
    return {
      text: '→ 0,0',
      arrow: '→',
      title: 'Variação do NPS dos mesmos clientes presentes nos dois períodos.',
    };
  }
  if (delta > 0) {
    return {
      text: `↑ +${formatted}`,
      arrow: '↑',
      title: 'Variação do NPS dos mesmos clientes presentes nos dois períodos.',
    };
  }
  return {
    text: `↓ −${formatted}`,
    arrow: '↓',
    title: 'Variação do NPS dos mesmos clientes presentes nos dois períodos.',
  };
}

export function sortEpForRanking(entries, mode = 'nps_desc') {
  const list = [...entries];
  if (mode === 'attention') {
    const rank = {
      [EP_STATUS.CRITICAL]: 0,
      [EP_STATUS.BELOW_RISING]: 1,
      [EP_STATUS.ABOVE_FALLING]: 2,
      [EP_STATUS.NO_COMPARE]: 3,
      [EP_STATUS.STRONG]: 4,
    };
    return list.sort((a, b) => {
      const sa = rank[a._statusKey ?? EP_STATUS.NO_COMPARE] ?? 3;
      const sb = rank[b._statusKey ?? EP_STATUS.NO_COMPARE] ?? 3;
      if (sa !== sb) return sa - sb;
      return (b.nps ?? -999) - (a.nps ?? -999);
    });
  }
  return list.sort((a, b) => (b.nps ?? -999) - (a.nps ?? -999));
}

export function npsBarPercent(nps) {
  if (nps == null || Number.isNaN(nps)) return 50;
  return Math.max(0, Math.min(100, ((Number(nps) + 100) / 200) * 100));
}
