import { formatNps, formatPct } from '../utils/format.js';

const NEGATIVE_MIGRATION_KEYS = new Set([
  'Promotor -> Neutro',
  'Promotor -> Detrator',
  'Neutro -> Detrator',
]);

function normalizeMigrationKey(key) {
  return (key ?? '').replace(' → ', ' -> ').replace('→', '->');
}

function fmtAbsDelta(delta) {
  if (delta == null || Number.isNaN(delta)) return null;
  return formatNps(Math.abs(delta));
}

/** Frase principal da leitura executiva (valores reais do recorte). */
export function buildExecutiveHeadline(currentSummary, previousSummary) {
  const nps = currentSummary?.nps;
  if (nps == null || Number.isNaN(nps)) {
    return 'NPS indisponível para o recorte selecionado.';
  }
  const prev = previousSummary?.nps;
  const delta = prev != null && !Number.isNaN(prev) ? nps - prev : null;
  const npsStr = formatNps(nps);

  if (delta == null) {
    return `NPS atual em ${npsStr}.`;
  }

  const dStr = fmtAbsDelta(delta);
  if (Math.abs(delta) <= 1) {
    let text = `NPS atual em ${npsStr}, permanecendo estável frente ao ciclo anterior.`;
    if (nps >= 60 && delta < 0) {
      text = `NPS atual em ${npsStr}, mantendo desempenho acima de 60, mas abaixo do ciclo anterior.`;
    }
    return text;
  }
  if (delta < 0) {
    return `NPS atual em ${npsStr}, com queda de ${dStr} pontos frente ao ciclo anterior.`;
  }
  return `NPS atual em ${npsStr}, com avanço de ${dStr} pontos frente ao ciclo anterior.`;
}

export function summarizeMovementFromMatrix(migrationMatrix, pairedClients = 0) {
  if (!migrationMatrix?.cells?.length) {
    return { available: false, worsened_clients: 0, topNegative: null, paired: pairedClients };
  }
  const cells = migrationMatrix.cells.map((c) => ({
    ...c,
    key: normalizeMigrationKey(c.key),
    label: normalizeMigrationKey(c.key).replace(' -> ', ' → '),
  }));
  let worsened_clients = 0;
  for (const cell of cells) {
    if (NEGATIVE_MIGRATION_KEYS.has(cell.key)) worsened_clients += cell.count ?? 0;
  }
  const topNegative = cells
    .filter((c) => NEGATIVE_MIGRATION_KEYS.has(c.key) && (c.count ?? 0) > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
  return {
    available: true,
    worsened_clients,
    topNegative: topNegative
      ? { migration: topNegative.label, count: topNegative.count }
      : null,
    paired: migrationMatrix.paired_clients ?? pairedClients,
  };
}

function insightMovement(delta) {
  if (delta == null || Math.abs(delta) < 0.05) return null;
  const dStr = fmtAbsDelta(delta);
  if (delta < 0) {
    return {
      priority: 100 + Math.min(Math.abs(delta), 20),
      text: `NPS caiu ${dStr} pontos frente ao ciclo anterior.`,
    };
  }
  return {
    priority: 95 + Math.min(delta, 20),
    text: `NPS avançou ${dStr} pontos frente ao ciclo anterior.`,
  };
}

function insightMigration(movement) {
  if (!movement?.available || !(movement.worsened_clients > 0)) return null;
  const n = movement.paired ?? 0;
  return {
    priority: 88 + Math.min(movement.worsened_clients, 15),
    text: `Entre ${n} clientes pareados, ${movement.worsened_clients} migraram para uma categoria inferior.`,
  };
}

function insightTopMigration(movement) {
  if (!movement?.topNegative) return null;
  return {
    priority: 82 + Math.min(movement.topNegative.count, 10),
    text: `Principal migração negativa: ${movement.topNegative.migration} (${movement.topNegative.count} clientes).`,
  };
}

function insightVoc(voc) {
  const top = voc?.top_negative_topics?.[0];
  if (!top?.topic) return null;
  const neg = top.negative_pct != null ? formatPct(top.negative_pct, 1) : '—';
  const share = top.pct_responses != null ? formatPct(top.pct_responses, 1) : '—';
  return {
    priority: 75 + (top.negative_pct ?? 0) * 0.5,
    text: `${top.topic} concentrou ${neg} de valência negativa entre menções ao tema (${share} dos comentários classificados).`,
  };
}

function insightEps(eps) {
  const list = eps?.eps_attention ?? [];
  if (!list.length) return null;
  const declining = list.filter((e) => (e.delta_nps_paired ?? 0) < -5);
  const n = declining.length || list.length;
  return {
    priority: 70 + n,
    text: `${n} EP${n === 1 ? '' : 's'} com sinal de atenção no ciclo (NPS ou confiança da amostra).`,
  };
}

function insightPaired(paired) {
  if (paired?.delta_nps_paired == null || paired.paired_clients < 5) return null;
  const d = paired.delta_nps_paired;
  if (Math.abs(d) < 1) return null;
  const dStr = fmtAbsDelta(d);
  return {
    priority: 85 + Math.min(Math.abs(d), 15),
    text:
      d < 0
        ? `Entre os mesmos clientes, o NPS pareado recuou ${dStr} pontos.`
        : `Entre os mesmos clientes, o NPS pareado avançou ${dStr} pontos.`,
  };
}

/**
 * @returns {{ headline: string, highlights: string[] }}
 */
export function buildExecutiveHighlights({
  currentSummary,
  previousSummary,
  paired,
  migrationMatrix,
  diagnosisFallback,
}) {
  const headline = buildExecutiveHeadline(currentSummary, previousSummary);
  const delta =
    currentSummary?.nps != null && previousSummary?.nps != null
      ? currentSummary.nps - previousSummary.nps
      : null;

  let movement = summarizeMovementFromMatrix(migrationMatrix, paired?.paired_clients ?? 0);
  if (!movement.available && diagnosisFallback?.movement?.available) {
    const dm = diagnosisFallback.movement;
    const top = dm.top_movements?.[0];
    movement = {
      available: true,
      worsened_clients: dm.worsened_clients ?? 0,
      topNegative: top ? { migration: top.migration, count: top.count } : null,
      paired: paired?.paired_clients ?? dm.paired_clients ?? 0,
    };
  }

  const voc = diagnosisFallback?.voc;
  const eps = diagnosisFallback?.eps;

  const candidates = [
    insightMovement(delta),
    insightMigration(movement),
    insightPaired(paired),
    insightTopMigration(movement),
    insightVoc(voc),
    insightEps(eps),
  ].filter(Boolean);

  candidates.sort((a, b) => b.priority - a.priority);

  const highlights = [];
  const used = new Set();
  for (const c of candidates) {
    if (highlights.length >= 3) break;
    const key = c.text.slice(0, 40);
    if (used.has(key)) continue;
    used.add(key);
    highlights.push(c.text);
  }

  return { headline, highlights };
}

const DRIVER_COPY = {
  negative_topics_count:
    'Clientes com mais temas negativos nos comentários tendem a apresentar notas menores.',
  meetings_count:
    'Maior volume de reuniões antes da resposta associa-se, na amostra, a notas mais altas.',
  mechanisms_count:
    'Clientes com mais mecanismos implementados até a resposta tendem a notar melhor a experiência.',
  tenure_months: 'Tempo de relacionamento mais longo associa-se a padrões distintos de nota na amostra.',
};

export function humanizeExecutiveDriver(driverRow) {
  if (!driverRow) return null;
  const key = driverRow.driver ?? driverRow.feature;
  if (key && DRIVER_COPY[key]) {
    return `${DRIVER_COPY[key]} Associação observada; não implica causalidade.`;
  }
  const raw = String(driverRow.text ?? '');
  if (/negative_topics/i.test(raw)) {
    return `${DRIVER_COPY.negative_topics_count} Associação observada; não implica causalidade.`;
  }
  if (/meetings/i.test(raw)) {
    return `${DRIVER_COPY.meetings_count} Associação observada; não implica causalidade.`;
  }
  if (raw.includes('associado') || raw.includes('associação')) {
    return `${raw.replace(/\s*\(.*\)\s*$/, '').trim()}. Associação observada; não implica causalidade.`;
  }
  return raw || null;
}

/** Dados compactos para o drawer de diagnóstico. */
export function buildExecutiveModalModel({
  currentSummary,
  previousSummary,
  paired,
  migrationMatrix,
  diagnosisFallback,
  currentCycleName,
}) {
  const movement = summarizeMovementFromMatrix(migrationMatrix, paired?.paired_clients ?? 0);
  const vocTop = diagnosisFallback?.voc?.top_negative_topics?.[0];
  const drivers = (diagnosisFallback?.drivers?.executive_drivers ?? [])
    .slice(0, 3)
    .map(humanizeExecutiveDriver)
    .filter(Boolean);
  const eps = (diagnosisFallback?.eps?.eps_attention ?? []).slice(0, 5);

  return {
    cycleName: currentCycleName,
    overall: {
      nps: currentSummary?.nps,
      previousNps: previousSummary?.nps,
      validResponses: currentSummary?.valid_responses,
      pairedClients: paired?.paired_clients,
    },
    movement,
    eps,
    voc: vocTop
      ? {
          topic: vocTop.topic,
          pctResponses: vocTop.pct_responses,
          negativePct: vocTop.negative_pct,
        }
      : null,
    drivers,
    managementQuestions: (diagnosisFallback?.management_questions ?? []).slice(0, 5),
  };
}
