import {
  HISTORICO_OFFICIAL_MEDICOES,
  mergeResponses,
  normalizeNameKey,
} from './customer-nps-cohorts.mjs';

const FIELD_KEYS = [
  'nota_estrategista',
  'nota_backoffice',
  'nota_qv360',
  'nota_arquitetura_patrimonial',
  'plano_patrimonial',
  'plano_apresentado',
  'caminho',
  'momento',
  'motivo_nota',
  'melhoria',
  'razao_positiva',
  'retencao_5_anos',
  'comentario_adicional',
  'reunioes_realizadas',
  'versao_formulario',
];

function npsFromScores(scores) {
  if (!scores.length) return null;
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return Math.round(((100 * prom - 100 * det) / scores.length) * 10) / 10;
}

function cycleSortKey(ciclo) {
  const s = String(ciclo ?? '');
  const m = s.match(/^(\d{4})-Q(\d)/);
  if (m) return Number(m[1]) * 10 + Number(m[2]);
  return 9000 + s.charCodeAt(0);
}

function attachClientIds(merged, pharusClients) {
  const byNorm = new Map();
  for (const c of pharusClients) {
    byNorm.set(normalizeNameKey(c.name), c.id);
    if (c.codigo) byNorm.set(normalizeNameKey(c.codigo), c.id);
  }
  return merged.map((r) => {
    let cid = r.client_id;
    if (!cid && r.client_name_key) cid = byNorm.get(r.client_name_key) ?? null;
    return { ...r, client_id: cid };
  });
}

function enrichCurrentComments(merged, currentRows) {
  const byKey = new Map();
  for (const row of currentRows) {
    const m = {
      response_key: row.typeform_response_id ? `id:${row.typeform_response_id}` : null,
      comment: row.comment ?? null,
    };
    if (m.response_key) byKey.set(m.response_key, row.comment);
  }
  return merged.map((r) => {
    if (r.source !== 'current') return r;
    const comment = byKey.get(r.response_key) ?? r.comment ?? null;
    const hf = r.historico_fields ?? {};
    return {
      ...r,
      comment,
      historico_fields: {
        ...hf,
        comentario_adicional: hf.comentario_adicional ?? comment,
        versao_formulario: hf.versao_formulario ?? null,
      },
    };
  });
}

export function buildHistoricoNpsArtifacts({
  currentResponses = [],
  historicoResponses = [],
  clients = [],
  cohorts = [],
  audit = {},
  officialMedicoes = HISTORICO_OFFICIAL_MEDICOES,
}) {
  const pharus = clients.filter((c) => (c.programa ?? '').toUpperCase() === 'PHARUS');
  let merged = mergeResponses(currentResponses, historicoResponses);
  merged = enrichCurrentComments(merged, currentResponses);
  merged = attachClientIds(merged, pharus);

  const cohortById = new Map(cohorts.map((c) => [c.client_id, c]));

  const responses = merged.map((r) => {
    const co = r.client_id ? cohortById.get(r.client_id) : null;
    const hf = r.historico_fields ?? {};
    const hasComment = Boolean(
      (hf.comentario_adicional ?? r.comment ?? '').toString().trim(),
    );
    return {
      response_key: r.response_key,
      client_id: r.client_id,
      client_name: r.client_name ?? co?.client_name ?? null,
      ciclo: r.ciclo,
      ciclo_label: r.ciclo_label ?? r.ciclo,
      data_resposta: r.data_resposta,
      nota_nps: r.nota_nps,
      categoria: r.categoria,
      source: r.source,
      programa: r.programa ?? co?.programa ?? 'PHARUS',
      ep: r.ep ?? co?.ep ?? null,
      safra_trimestre: co?.safra_trimestre ?? null,
      versao_formulario: hf.versao_formulario ?? null,
      historico_fields: r.historico_fields,
      has_comment: hasComment,
    };
  });

  const officialByCiclo = new Map(officialMedicoes.map((m) => [m.ciclo, m]));
  const cyclesSet = new Set(responses.map((r) => r.ciclo).filter(Boolean));
  for (const m of officialMedicoes) cyclesSet.add(m.ciclo);
  const cyclesOrdered = [...cyclesSet].sort((a, b) => cycleSortKey(a) - cycleSortKey(b));

  const summaryRows = [];
  let prevOfficialNps = null;
  for (const ciclo of cyclesOrdered) {
    const rows = responses.filter((r) => r.ciclo === ciclo && r.nota_nps != null);
    const scores = rows.map((r) => r.nota_nps);
    const clientsUnique = new Set(rows.map((r) => r.client_id).filter(Boolean)).size;
    const prom = scores.filter((s) => s >= 9).length;
    const neu = scores.filter((s) => s >= 7 && s <= 8).length;
    const det = scores.filter((s) => s <= 6).length;
    const official = officialByCiclo.get(ciclo);
    const npsOfficial = official?.nps ?? null;
    const npsDerived = npsFromScores(scores);
    const npsDisplay = npsOfficial != null ? npsOfficial : npsDerived;
    const varVsPrev =
      npsDisplay != null && prevOfficialNps != null
        ? Math.round((npsDisplay - prevOfficialNps) * 10) / 10
        : null;
    if (npsOfficial != null) prevOfficialNps = npsOfficial;
    else if (npsDerived != null) prevOfficialNps = npsDerived;

    summaryRows.push({
      ciclo,
      periodo: official?.medicao ?? null,
      respostas: official?.respostas ?? rows.length,
      respostas_derivadas: rows.length,
      clientes_unicos: clientsUnique,
      promotores: prom,
      neutros: neu,
      detratores: det,
      pct_promotores: scores.length ? Math.round((1000 * prom) / scores.length) / 10 : null,
      pct_neutros: scores.length ? Math.round((1000 * neu) / scores.length) / 10 : null,
      pct_detratores: scores.length ? Math.round((1000 * det) / scores.length) / 10 : null,
      nps_oficial: npsOfficial,
      nps_derivado: npsDerived,
      nota_media: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
      variacao_vs_anterior: varVsPrev,
      is_official: Boolean(official),
    });
  }

  // fix promotores for official rows - use calc from data when available
  for (const row of summaryRows) {
    if (row.promotores_calc != null) row.promotores = row.promotores_calc;
  }

  const clientMap = new Map();
  for (const r of responses) {
    if (!r.client_id) continue;
    if (!clientMap.has(r.client_id)) {
      clientMap.set(r.client_id, {
        client_id: r.client_id,
        client_name: r.client_name,
        medicoes: [],
        scores: [],
      });
    }
    const g = clientMap.get(r.client_id);
    g.medicoes.push(r.ciclo);
    if (r.nota_nps != null) g.scores.push({ ciclo: r.ciclo, score: r.nota_nps, cat: r.categoria });
  }

  const clientsAgg = [...clientMap.values()].map((g) => {
    const co = cohortById.get(g.client_id);
    const scores = g.scores.map((x) => x.score);
    const sorted = [...g.scores].sort((a, b) => cycleSortKey(a.ciclo) - cycleSortKey(b.ciclo));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return {
      client_id: g.client_id,
      client_name: g.client_name ?? co?.client_name,
      qtd_medicoes: new Set(g.medicoes).size,
      primeira_resposta: first?.ciclo ?? null,
      ultima_resposta: last?.ciclo ?? null,
      primeira_nota: first?.score ?? null,
      ultima_nota: last?.score ?? null,
      delta: first && last ? Math.round((last.score - first.score) * 10) / 10 : null,
      media: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
      melhor_nota: scores.length ? Math.max(...scores) : null,
      pior_nota: scores.length ? Math.min(...scores) : null,
      ultima_categoria: last?.cat ?? co?.last_nps_category ?? null,
      safra_trimestre: co?.safra_trimestre ?? null,
      ep: co?.ep ?? null,
    };
  });

  const recurrence = { once: 0, twice: 0, three_plus: 0 };
  for (const c of clientsAgg) {
    if (c.qtd_medicoes <= 1) recurrence.once += 1;
    else if (c.qtd_medicoes === 2) recurrence.twice += 1;
    else recurrence.three_plus += 1;
  }

  const fieldCoverage = {};
  for (const key of FIELD_KEYS) fieldCoverage[key] = {};
  for (const r of responses) {
    const ciclo = r.ciclo;
    if (!ciclo) continue;
    const f = r.historico_fields ?? {};
    for (const key of FIELD_KEYS) {
      const v = f[key];
      if (v == null || String(v).trim() === '') continue;
      if (!fieldCoverage[key][ciclo]) fieldCoverage[key][ciclo] = 0;
      fieldCoverage[key][ciclo] += 1;
    }
  }

  const versions = new Map();
  for (const r of responses) {
    const v = r.versao_formulario ?? r.historico_fields?.versao_formulario;
    if (!v) continue;
    if (!versions.has(v)) versions.set(v, { versao: v, ciclos: new Set(), n: 0 });
    const ent = versions.get(v);
    ent.n += 1;
    if (r.ciclo) ent.ciclos.add(r.ciclo);
  }

  const meta = {
    generated_at: new Date().toISOString(),
    historico_input: historicoResponses.length,
    current_input: currentResponses.length,
    after_dedupe: responses.length,
    unique_clients: clientsAgg.length,
    unmatched_historico: audit.historico_unmatched_to_client ?? null,
    official_medicoes: officialMedicoes,
    recurrence,
  };

  return {
    meta,
    summary: { cycles: summaryRows },
    responses,
    clients: clientsAgg,
    field_coverage: { fields: FIELD_KEYS, cycles: cyclesOrdered, matrix: fieldCoverage },
    form_versions: [...versions.values()].map((v) => ({
      versao: v.versao,
      ciclos: [...v.ciclos].sort((a, b) => cycleSortKey(a) - cycleSortKey(b)),
      n: v.n,
    })),
  };
}
