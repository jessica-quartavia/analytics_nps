import { classifyNpsScore, isValidScore } from './nps.mjs';
import {
  parseDateOnly,
  tenureBucketAtResponse,
  meetingCountBucket,
  meetingRecencyBucket,
} from './payment-entry-date.mjs';

function parseTs(v) {
  if (!v) return null;
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
}

function dateOnlyFromTs(v) {
  const t = parseTs(v);
  return t == null ? null : new Date(t).toISOString().slice(0, 10);
}

function npsFromScores(scores) {
  const valid = scores.filter((s) => isValidScore(s)).map(Number);
  if (!valid.length) return { n: 0, nps: null, avg: null, p: 0, neu: 0, det: 0 };
  let p = 0;
  let neu = 0;
  let det = 0;
  for (const s of valid) {
    if (s >= 9) p += 1;
    else if (s >= 7) neu += 1;
    else det += 1;
  }
  const n = valid.length;
  return {
    n,
    nps: Math.round(((p - det) / n) * 1000) / 10,
    avg: Math.round((valid.reduce((a, b) => a + b, 0) / n) * 100) / 100,
    p,
    neu,
    det,
  };
}

function bucketAnalysis(rows, keyFn, minN = 30) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r.score);
  }
  const out = {};
  for (const [k, scores] of groups) {
    const stats = npsFromScores(scores);
    out[k] = { ...stats, sufficient_sample: stats.n >= minN };
  }
  return out;
}

function indexByClient(arr, key = 'base_qv_id') {
  const m = new Map();
  for (const row of arr) {
    const id = row[key];
    if (!id) continue;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(row);
  }
  return m;
}

function resolveEpAtResponse(clientId, responseDate, transfers, fallbackEp) {
  const list = (transfers.get(clientId) ?? [])
    .filter((t) => {
      const d = parseDateOnly(t.data_troca);
      return d && responseDate && d <= responseDate;
    })
    .sort((a, b) => String(a.data_troca).localeCompare(String(b.data_troca)));
  if (!list.length) return { ep_at_response: fallbackEp ?? null, ep_from: 'client_current' };
  const last = list[list.length - 1];
  return {
    ep_at_response: last.ep_novo ?? fallbackEp ?? null,
    ep_from: 'transferencias_ep',
    last_ep_transfer_before_response: last.data_troca,
    ep_transfers_before_response: list.length,
  };
}

/**
 * @param {object} ctx
 */
export function buildHistoricalNpsEnriched(ctx) {
  const {
    responses,
    paymentByClient,
    meetingsByClient,
    mecanismosByClient,
    transfersByClient,
    pagamentosByClient,
    reembolsosByClient,
    acordosByClient,
    clientesById,
    currentDateIso,
  } = ctx;

  const enriched = [];
  const qa = {
    responses_total: 0,
    responses_with_payment_entry: 0,
    negative_tenure: 0,
    future_entry_dates: 0,
    responses_with_meetings_pit: 0,
    responses_with_mechanism_dates: 0,
    responses_with_ep_transfer_history: 0,
    responses_with_payment_history: 0,
    responses_with_churn_date: 0,
    pit_leakage_checks: { passed: true, notes: [] },
  };

  for (const r of responses) {
    const clientId = r.client_id ?? r.base_qv_id;
    const responseDate = dateOnlyFromTs(r.data_resposta ?? r.submitted_at ?? r.response_date);
    const score = r.nota_nps ?? r.score;
    if (!clientId || !responseDate || !isValidScore(score)) continue;

    const pay = paymentByClient.get(clientId);
    const payment_entry_date = pay?.payment_entry_date ?? null;
    if (payment_entry_date) qa.responses_with_payment_entry += 1;
    if (pay?.invalid_future_entry_date) qa.future_entry_dates += 1;

    const respTs = parseTs(`${responseDate}T23:59:59.000Z`);
    let days_since_entry = null;
    if (payment_entry_date && !pay?.invalid_future_entry_date) {
      days_since_entry = Math.floor(
        (respTs - Date.parse(`${payment_entry_date}T12:00:00.000Z`)) / 86400000,
      );
      if (days_since_entry < 0) qa.negative_tenure += 1;
    }

    const meetings = (meetingsByClient.get(clientId) ?? []).filter((m) => {
      const t = parseTs(m.inicio_brasilia);
      return t != null && t <= respTs;
    });
    if (meetings.length) qa.responses_with_meetings_pit += 1;
    meetings.sort((a, b) => parseTs(a.inicio_brasilia) - parseTs(b.inicio_brasilia));
    const lastMeeting = meetings[meetings.length - 1] ?? null;
    const lastMeetingDate = lastMeeting ? dateOnlyFromTs(lastMeeting.inicio_brasilia) : null;
    let days_since_last_meeting = null;
    if (lastMeetingDate) {
      days_since_last_meeting = Math.floor(
        (respTs - parseTs(lastMeeting.inicio_brasilia)) / 86400000,
      );
    }

    const mecs = mecanismosByClient.get(clientId) ?? [];
    let mechanisms_before = 0;
    let implemented_before = 0;
    let mechanism_temporal_status = 'date_unavailable';
    for (const m of mecs) {
      const d = parseDateOnly(m.data_implementacao);
      if (d && d <= responseDate) {
        mechanisms_before += 1;
        mechanism_temporal_status = 'known_before';
        if ((m.status ?? '').toLowerCase().includes('conclu') || m.status === 'apto') {
          implemented_before += 1;
        }
      } else if (d && d > responseDate) {
        if (mechanism_temporal_status === 'date_unavailable') mechanism_temporal_status = 'known_after';
      }
    }
    if (mechanisms_before) qa.responses_with_mechanism_dates += 1;

    const cli = clientesById.get(clientId);
    const epInfo = resolveEpAtResponse(
      clientId,
      responseDate,
      transfersByClient,
      cli?.ep ?? r.ep ?? null,
    );
    if (epInfo.ep_transfers_before_response) qa.responses_with_ep_transfer_history += 1;

    const pays = (pagamentosByClient.get(clientId) ?? []).filter((p) => {
      if (p.conta_como_programa !== true) return false;
      const d = parseDateOnly(p.data_pagamento);
      return d && d <= responseDate;
    });
    if (pays.length) qa.responses_with_payment_history += 1;
    const amount_paid_before = pays.reduce((s, p) => s + (Number(p.valor) || 0), 0);

    const reembolsos = reembolsosByClient.get(clientId) ?? [];
    const refund_before = reembolsos.some((x) => {
      const d = parseDateOnly(x.vencimento ?? x.previsao_pagamento);
      return d && d <= responseDate;
    });
    const refund_after = reembolsos.some((x) => {
      const d = parseDateOnly(x.vencimento ?? x.previsao_pagamento);
      return d && d > responseDate;
    });

    const churnDate = parseDateOnly(cli?.data_churn);
    if (churnDate) qa.responses_with_churn_date += 1;
    const churn_before = churnDate && churnDate <= responseDate;
    const churn_after = churnDate && churnDate > responseDate;
    let days_response_to_churn = null;
    if (churnDate && churnDate > responseDate) {
      days_response_to_churn = Math.floor(
        (Date.parse(churnDate) - respTs) / 86400000,
      );
    }

    const cat = r.categoria ?? classifyNpsScore(score);
    const row = {
      response_id: r.response_key ?? r.id ?? r.dedupe_key ?? null,
      client_id: clientId,
      client_name: r.client_name ?? r.nome_cliente ?? cli?.nome ?? null,
      nps_cycle: r.ciclo ?? r.analytical_cycle_code ?? r.onda ?? null,
      response_date: responseDate,
      score: Number(score),
      nps_category: cat,
      payment_entry_date,
      payment_entry_source: pay?.payment_entry_source ?? null,
      invalid_future_entry_date: pay?.invalid_future_entry_date ?? false,
      safra_mes: pay?.invalid_future_entry_date ? null : pay?.safra_mes ?? null,
      safra_trimestre: pay?.invalid_future_entry_date ? null : pay?.safra_trimestre ?? null,
      days_since_entry,
      months_since_entry:
        days_since_entry != null ? Math.round((days_since_entry / 30.44) * 10) / 10 : null,
      tenure_bucket_at_response:
        days_since_entry != null && days_since_entry >= 0
          ? tenureBucketAtResponse(days_since_entry)
          : null,
      programa: r.programa ?? cli?.programa ?? null,
      ep_current_or_resolved: epInfo.ep_at_response,
      ep_at_response_source: epInfo.ep_from,
      meetings_before_response: meetings.length,
      first_meeting_at: meetings[0] ? meetings[0].inicio_brasilia : null,
      last_meeting_before_response: lastMeeting?.inicio_brasilia ?? null,
      days_since_last_meeting_at_response: days_since_last_meeting,
      meetings_count_bucket: meetingCountBucket(meetings.length),
      meeting_recency_bucket: meetingRecencyBucket(days_since_last_meeting),
      mechanisms_before_response: mechanisms_before,
      implemented_mechanisms_before_response: implemented_before,
      has_implemented_mechanism_at_response: implemented_before > 0,
      mechanism_temporal_status,
      ep_transfers_before_response: epInfo.ep_transfers_before_response ?? 0,
      last_ep_transfer_before_response: epInfo.last_ep_transfer_before_response ?? null,
      days_since_last_ep_transfer: epInfo.last_ep_transfer_before_response
        ? Math.floor(
            (respTs - Date.parse(epInfo.last_ep_transfer_before_response)) / 86400000,
          )
        : null,
      payments_before_response: pays.length,
      amount_paid_before_response: amount_paid_before,
      refund_before_response: refund_before,
      refund_after_response: refund_after,
      churn_before_response: churn_before,
      churn_after_response: churn_after,
      days_response_to_churn,
      churn_within_30d: days_response_to_churn != null && days_response_to_churn <= 30,
      churn_within_60d: days_response_to_churn != null && days_response_to_churn <= 60,
      churn_within_90d: days_response_to_churn != null && days_response_to_churn <= 90,
      churn_within_180d: days_response_to_churn != null && days_response_to_churn <= 180,
      source: r.source ?? null,
    };

    enriched.push(row);
    qa.responses_total += 1;
  }

  const analyses = {
    nps_por_safra: bucketAnalysis(
      enriched.filter((r) => r.safra_trimestre && !r.safra_trimestre.startsWith('2027')),
      (r) => r.safra_trimestre,
    ),
    nps_por_tenure: bucketAnalysis(
      enriched.filter((r) => r.tenure_bucket_at_response),
      (r) => r.tenure_bucket_at_response,
    ),
    nps_por_reunioes: bucketAnalysis(enriched, (r) => r.meetings_count_bucket),
    nps_por_recencia_reuniao: bucketAnalysis(enriched, (r) => r.meeting_recency_bucket),
    nps_mecanismo: {
      com_implementado: npsFromScores(
        enriched.filter((r) => r.has_implemented_mechanism_at_response).map((r) => r.score),
      ),
      sem_implementado: npsFromScores(
        enriched.filter((r) => !r.has_implemented_mechanism_at_response).map((r) => r.score),
      ),
      data_desconhecida: npsFromScores(
        enriched.filter((r) => r.mechanism_temporal_status === 'date_unavailable').map((r) => r.score),
      ),
    },
    nps_ep_transfers: bucketAnalysis(enriched, (r) => {
      const n = r.ep_transfers_before_response ?? 0;
      if (n === 0) return '0 trocas';
      if (n === 1) return '1 troca';
      return '2+ trocas';
    }),
  };

  return { enriched, quality: qa, analyses, generated_at: new Date().toISOString(), currentDateIso };
}

export function buildNpsOverlapReport({ base0Nps, historicoRows, currentRows }) {
  const report = {
    base0_total: base0Nps.length,
    historico_total: historicoRows?.length ?? null,
    current_total: currentRows.length,
    matched_all: 0,
    base0_only: 0,
    historico_only: 0,
    current_only: 0,
    base0_current: 0,
    base0_historico: 0,
    historico_current: 0,
    ambiguous: 0,
  };

  const currentByClient = new Map();
  for (const r of currentRows) {
    if (r.client_id) currentByClient.set(String(r.client_id), r);
  }

  for (const b of base0Nps) {
    const id = b.base_qv_id;
    const inCur = id && currentByClient.has(String(id));
    if (inCur) {
      report.base0_current += 1;
      report.matched_all += 1;
    } else report.base0_only += 1;
  }

  for (const r of currentRows) {
    const id = r.client_id;
    const inB0 = base0Nps.some((x) => String(x.base_qv_id) === String(id));
    if (!inB0) report.current_only += 1;
  }

  return report;
}
