import { calculateNpsSummary } from '../analytics/nps.mjs';

const T2_NAME = 'NPS 2026-T2';

function extractFormMeta(rawPayload) {
  const fr = rawPayload?.form_response;
  if (!fr) {
    return {
      form_id: null,
      definition_id: null,
      form_title: null,
      field_refs: [],
      payload_class: rawPayload == null ? 'null_payload' : 'no_form_response',
    };
  }
  const fields = fr.definition?.fields ?? [];
  const field_refs = fields
    .map((f) => f.ref)
    .filter(Boolean)
    .sort();
  return {
    form_id: fr.form_id ?? null,
    definition_id: fr.definition?.id ?? null,
    form_title: fr.definition?.title ?? null,
    field_refs,
    payload_class: fr.form_id ? 'with_form_id' : 'form_response_without_form_id',
  };
}

function formSignature(meta) {
  return JSON.stringify({
    form_id: meta.form_id,
    definition_id: meta.definition_id,
    field_refs: meta.field_refs,
  });
}

function dayKey(iso) {
  return iso.slice(0, 10);
}

function computeGaps(dailyDates) {
  if (!dailyDates.length) return [];
  const sorted = [...dailyDates].sort();
  const gaps = [];
  const start = new Date(`${sorted[0]}T12:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1]}T12:00:00Z`);
  const present = new Set(sorted);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    if (!present.has(key)) gaps.push(key);
  }
  return gaps;
}

function classifyRepeatClient(responses) {
  const pre = responses.filter((r) => r.window === 'pre_t2');
  const inT2 = responses.filter((r) => r.window === 'in_t2');
  const forms = new Set(responses.map((r) => r.form_id ?? 'null'));
  if (pre.length > 1 && inT2.length === 0) {
    const sameForm = forms.size === 1;
    return sameForm ? 'provável duplicidade' : 'ambíguo';
  }
  if (pre.length >= 1 && inT2.length >= 1) {
    return 'possível nova medição';
  }
  return 'ambíguo';
}

export async function buildPreT2Diagnostics(baseQv) {
  const { data: t2Rows, error: t2Err } = await baseQv
    .from('nps_cycles')
    .select('id, name, starts_at, ends_at, programa, notes')
    .eq('name', T2_NAME)
    .limit(1);
  if (t2Err) throw t2Err;
  const t2 = t2Rows?.[0];
  if (!t2) throw new Error(`Ciclo ${T2_NAME} não encontrado em nps_cycles`);

  const t2Starts = t2.starts_at;
  const t2Ends = t2.ends_at;

  const { data: responses, error: rErr } = await baseQv
    .from('nps_responses')
    .select(
      'id, typeform_response_id, client_id, client_name, client_email, score, comment, submitted_at, tipo_de_forms, raw_payload',
    )
    .ilike('tipo_de_forms', 'NPS%')
    .order('submitted_at');
  if (rErr) throw rErr;

  const clientIds = [...new Set((responses ?? []).map((r) => r.client_id).filter(Boolean))];
  const clientsMap = new Map();
  const chunk = 200;
  for (let i = 0; i < clientIds.length; i += chunk) {
    const slice = clientIds.slice(i, i + chunk);
    const { data: clients, error: cErr } = await baseQv
      .from('clients')
      .select('id, codigo, programa, status')
      .in('id', slice);
    if (cErr) throw cErr;
    for (const c of clients ?? []) clientsMap.set(c.id, c);
  }

  const enriched = (responses ?? []).map((r) => {
    const client = r.client_id ? clientsMap.get(r.client_id) : null;
    const meta = extractFormMeta(r.raw_payload);
    const submitted = r.submitted_at;
    const isPre = submitted < t2Starts;
    const isInT2 = submitted >= t2Starts && submitted <= t2Ends;
    return {
      ...r,
      programa: client?.programa ?? null,
      codigo: client?.codigo ?? null,
      status: client?.status ?? null,
      form_meta: meta,
      window: isPre ? 'pre_t2' : isInT2 ? 'in_t2' : 'other',
    };
  });

  const pre = enriched.filter((r) => r.window === 'pre_t2');
  const inT2 = enriched.filter((r) => r.window === 'in_t2');
  const prePharus = pre.filter((r) => r.programa === 'PHARUS');
  const preDavos = pre.filter((r) => r.programa === 'DAVOS');
  const preUnknown = pre.filter((r) => !r.programa);

  const dailyMap = new Map();
  for (const r of pre) {
    const d = dayKey(r.submitted_at);
    if (!dailyMap.has(d)) {
      dailyMap.set(d, { date: d, total: 0, pharus: 0, davos: 0, unknown_program: 0 });
    }
    const row = dailyMap.get(d);
    row.total++;
    if (r.programa === 'PHARUS') row.pharus++;
    else if (r.programa === 'DAVOS') row.davos++;
    else row.unknown_program++;
  }

  const weeklyMap = new Map();
  for (const r of pre) {
    const dt = new Date(r.submitted_at);
    const day = dt.getUTCDay();
    const diff = (day + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - diff);
    const wk = dt.toISOString().slice(0, 10);
    if (!weeklyMap.has(wk)) weeklyMap.set(wk, { week_start: wk, total: 0, pharus: 0, davos: 0 });
    const row = weeklyMap.get(wk);
    row.total++;
    if (r.programa === 'PHARUS') row.pharus++;
    else if (r.programa === 'DAVOS') row.davos++;
  }

  const timeline = {
    t2_formal: {
      id: t2.id,
      name: t2.name,
      starts_at: t2.starts_at,
      ends_at: t2.ends_at,
      programa: t2.programa,
      notes: t2.notes,
    },
    first_response: pre[0]?.submitted_at ?? null,
    last_response: pre[pre.length - 1]?.submitted_at ?? null,
    total: pre.length,
    pharus: prePharus.length,
    davos: preDavos.length,
    unknown_program: preUnknown.length,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    weekly: [...weeklyMap.values()].sort((a, b) => a.week_start.localeCompare(b.week_start)),
    gaps: computeGaps([...dailyMap.keys()]),
    waves_observed: [
      {
        label: 'Jun 16–26 — respostas sem raw_payload Typeform',
        approx_start: '2026-06-16',
        approx_end: '2026-06-26',
        responses: pre.filter((r) => r.form_meta.payload_class === 'null_payload').length,
        pharus: pre.filter(
          (r) => r.programa === 'PHARUS' && r.form_meta.payload_class === 'null_payload',
        ).length,
      },
      {
        label: 'Jun 28–Jul 1 — form_id rzzF4ukM (pré início formal T2)',
        approx_start: '2026-06-28',
        approx_end: '2026-07-01',
        responses: pre.filter((r) => r.form_meta.form_id === 'rzzF4ukM').length,
        pharus: pre.filter((r) => r.programa === 'PHARUS' && r.form_meta.form_id === 'rzzF4ukM')
          .length,
      },
    ],
    generated_at: new Date().toISOString(),
  };

  const formGroups = new Map();
  for (const r of pre) {
    const sig = formSignature(r.form_meta);
    const key = `${r.tipo_de_forms}::${sig}`;
    if (!formGroups.has(key)) {
      formGroups.set(key, {
        tipo_de_forms: r.tipo_de_forms,
        form_id: r.form_meta.form_id,
        definition_id: r.form_meta.definition_id,
        form_title: r.form_meta.form_title,
        form_signature: r.form_meta.field_refs,
        payload_class: r.form_meta.payload_class,
        responses: [],
      });
    }
    formGroups.get(key).responses.push(r);
  }

  const forms = [...formGroups.values()].map((g) => {
    const scores = g.responses.map((r) => r.score);
    const summary = calculateNpsSummary(scores.map((score) => ({ score })));
    return {
      ...g,
      response_count: g.responses.length,
      pharus_count: g.responses.filter((r) => r.programa === 'PHARUS').length,
      davos_count: g.responses.filter((r) => r.programa === 'DAVOS').length,
      first_at: g.responses[0]?.submitted_at,
      last_at: g.responses[g.responses.length - 1]?.submitted_at,
      distinct_clients: new Set(g.responses.map((r) => r.client_id).filter(Boolean)).size,
      avg_score: scores.reduce((a, b) => a + b, 0) / scores.length,
      nps: summary.nps,
      responses: undefined,
    };
  });

  const preFormSigs = new Set(pre.map((r) => formSignature(r.form_meta)));
  const t2FormSigs = new Set(inT2.map((r) => formSignature(r.form_meta)));

  const formComparison = {
    t2_window: { starts_at: t2Starts, ends_at: t2Ends },
    pre_t2_sample_size: pre.length,
    in_t2_sample_size: inT2.length,
    pre_t2_form_signatures: [...preFormSigs],
    in_t2_form_signatures: [...t2FormSigs],
    shared_signatures: [...preFormSigs].filter((s) => t2FormSigs.has(s)),
    pre_only_signatures: [...preFormSigs].filter((s) => !t2FormSigs.has(s)),
    in_t2_only_signatures: [...t2FormSigs].filter((s) => !preFormSigs.has(s)),
    rzzF4ukM_bridge: {
      pre_t2_rzz_count: pre.filter((r) => r.form_meta.form_id === 'rzzF4ukM').length,
      in_t2_rzz_count: inT2.filter((r) => r.form_meta.form_id === 'rzzF4ukM').length,
      pre_t2_rzz_last_at: pre.filter((r) => r.form_meta.form_id === 'rzzF4ukM').at(-1)
        ?.submitted_at,
      in_t2_rzz_first_at: inT2.filter((r) => r.form_meta.form_id === 'rzzF4ukM')[0]
        ?.submitted_at,
    },
    conclusion_notes: [
      'T2 formal usa exclusivamente form_id rzzF4ukM (NPS PHARUS OFICIAL).',
      'Pré-T2 inclui bloco legacy sem raw_payload (149 respostas) e bloco rzzF4ukM (76).',
      'Continuidade temporal rzzF4ukM: 2026-06-28 → 2026-07-24 dentro/amostra T2.',
    ],
  };

  const byClient = new Map();
  for (const r of enriched) {
    if (!r.client_id) continue;
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, []);
    byClient.get(r.client_id).push(r);
  }

  const repeatClients = [];
  for (const [clientId, rows] of byClient) {
    const preRows = rows.filter((r) => r.window === 'pre_t2');
    const t2RowsC = rows.filter((r) => r.window === 'in_t2');
    if (preRows.length <= 1 && t2RowsC.length === 0) continue;
    if (preRows.length <= 1 && t2RowsC.length <= 1 && !(preRows.length && t2RowsC.length))
      continue;

    const payload = rows.map((r) => ({
      id: r.id,
      submitted_at: r.submitted_at,
      score: r.score,
      typeform_response_id: r.typeform_response_id,
      form_id: r.form_meta.form_id,
      tipo_de_forms: r.tipo_de_forms,
      window: r.window,
    }));

    repeatClients.push({
      client_id: clientId,
      client_name: rows[0].client_name,
      programa: rows[0].programa,
      responses: payload,
      classification: classifyRepeatClient(payload),
    });
  }

  const unionPharus = enriched.filter(
    (r) =>
      r.programa === 'PHARUS' &&
      (r.window === 'pre_t2' || r.window === 'in_t2'),
  );

  const dedupeLatest = new Map();
  for (const r of unionPharus) {
    const prev = dedupeLatest.get(r.client_id);
    if (!prev || r.submitted_at > prev.submitted_at) dedupeLatest.set(r.client_id, r);
  }

  const historicalExpected = 262;
  const reconciliation = {
    historical_known_pharus_jun_jul_2026: historicalExpected,
    pre_t2_pharus_responses: prePharus.length,
    in_t2_pharus_responses: inT2.filter((r) => r.programa === 'PHARUS').length,
    union_raw_pharus_pre_plus_t2_window: unionPharus.length,
    union_distinct_clients: new Set(unionPharus.map((r) => r.client_id)).size,
    union_distinct_typeform_ids: new Set(unionPharus.map((r) => r.typeform_response_id)).size,
    dedupe_latest_one_per_client: dedupeLatest.size,
    dedupe_one_per_typeform: unionPharus.length,
    only_rzzF4ukM_responses: unionPharus.filter((r) => r.form_meta.form_id === 'rzzF4ukM')
      .length,
    calendar_jun1_jul31_pharus_before_aug1: unionPharus.filter(
      (r) => r.submitted_at >= '2026-06-01' && r.submitted_at < '2026-08-01',
    ).length,
    difference_vs_historical_union_raw: unionPharus.length - historicalExpected,
    difference_vs_historical_dedupe_client: dedupeLatest.size - historicalExpected,
    jun16_jun30_pharus_responses: unionPharus.filter(
      (r) => r.submitted_at >= '2026-06-16' && r.submitted_at < '2026-07-01',
    ).length,
    nps_union_pharus_pre_t2_plus_t2: calculateNpsSummary(unionPharus.map((r) => ({ score: r.score }))),
  };

  const cycleCandidates = [
    {
      candidate_code: 'JUN-JUL-2026-PHARUS-UNION-PRE-T2-T2-WINDOW',
      candidate_name: 'Jun–Jul/2026 PHARUS (pré-T2 + janela formal T2)',
      start: prePharus[0]?.submitted_at ?? null,
      end: inT2.filter((r) => r.programa === 'PHARUS').at(-1)?.submitted_at ?? t2Ends,
      responses_raw: unionPharus.length,
      responses_pharus: unionPharus.length,
      distinct_clients: reconciliation.union_distinct_clients,
      forms: ['null_payload_legacy', 'rzzF4ukM'],
      form_signature: ['legacy_no_typeform_payload', formSignature(extractFormMeta({ form_response: { form_id: 'rzzF4ukM', definition: { id: 'rzzF4ukM', fields: [] } } }))],
      evidence: [
        '257 respostas PHARUS cobrem jun–jul antes de ago/2026 no BASE QV',
        'Mesmo form_id rzzF4ukM conecta 28/jun–02/jul ao início formal T2',
        '262 histórico externo vs 257 observado (−5) — gap pequeno',
      ],
      evidence_against: [
        '140 respostas PHARUS pré-T2 sem raw_payload — instrumento não verificável',
        'Duas ondas distintas (16–26 legacy vs 28/jun+ Typeform oficial)',
      ],
      historical_expected_responses: historicalExpected,
      difference_from_historical: unionPharus.length - historicalExpected,
      confidence: 'medium',
    },
    {
      candidate_code: 'RZZ-OFFICIAL-ONLY',
      candidate_name: 'Somente Typeform rzzF4ukM (NPS PHARUS OFICIAL)',
      start: pre.filter((r) => r.form_meta.form_id === 'rzzF4ukM')[0]?.submitted_at,
      end: inT2.filter((r) => r.form_meta.form_id === 'rzzF4ukM').at(-1)?.submitted_at,
      responses_raw: unionPharus.filter((r) => r.form_meta.form_id === 'rzzF4ukM').length,
      responses_pharus: unionPharus.filter((r) => r.form_meta.form_id === 'rzzF4ukM').length,
      distinct_clients: new Set(
        unionPharus.filter((r) => r.form_meta.form_id === 'rzzF4ukM').map((r) => r.client_id),
      ).size,
      forms: ['rzzF4ukM'],
      form_signature: ['rzzF4ukM official field set'],
      evidence: ['Mesmo instrumento pré e pós starts_at T2', 'Título NPS PHARUS (OFICIAL)'],
      evidence_against: ['Exclui 140 respostas PHARUS legacy — provavelmente parte da mesma medição histórica'],
      historical_expected_responses: historicalExpected,
      difference_from_historical:
        unionPharus.filter((r) => r.form_meta.form_id === 'rzzF4ukM').length - historicalExpected,
      confidence: 'low',
    },
  ];

  const ambiguousResponses = [];
  for (const r of pre) {
    const reasons = [];
    if (r.form_meta.payload_class === 'null_payload') {
      reasons.push('raw_payload ausente — form_id e perguntas indetermináveis');
    }
    if (r.tipo_de_forms !== 'NPS') reasons.push(`tipo_de_forms atípico: ${r.tipo_de_forms}`);
    if (!r.programa) reasons.push('programa desconhecido');
    if (reasons.length) {
      ambiguousResponses.push({
        response_id: r.id,
        client_id: r.client_id,
        submitted_at: r.submitted_at,
        score: r.score,
        form_id: r.form_meta.form_id,
        tipo_de_forms: r.tipo_de_forms,
        programa: r.programa,
        reasons,
      });
    }
  }

  return {
    meta: {
      t2_starts_at: t2Starts,
      pre_t2_total: pre.length,
      reconciliation,
    },
    timeline,
    forms,
    formComparison,
    repeatClients,
    cycleCandidates,
    ambiguousResponses,
    reconciliation,
  };
}
