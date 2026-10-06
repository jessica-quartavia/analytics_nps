#!/usr/bin/env node
/**
 * QA automatizado Fase 2 — enriched vs BASE0 (amostra) + integridade datasets.
 */
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { createBusinessDataClient } from '../lib/persistence/business-data-client.mjs';

dotenv.config();

const enriched = JSON.parse(readFileSync('data/processed/historical_nps_enriched.json', 'utf8'));
const summary = JSON.parse(readFileSync('data/processed/historical_nps_summary.json', 'utf8'));
const cohorts = JSON.parse(readFileSync('data/processed/customer_nps_cohorts.json', 'utf8'));

async function pitCheck(clientId, responseDate, row) {
  const sb = createBusinessDataClient('base0');
  const { data: cl } = await sb.from('clientes').select('base_qv_id,nome').eq('base_qv_id', clientId).limit(1);
  const id = cl?.[0]?.base_qv_id ?? clientId;
  if (!id) return { clientId, error: 'client_not_found' };
  const { data: reunioes } = await sb.from('reunioes').select('inicio_brasilia').eq('base_qv_id', id);
  const { data: pag } = await sb
    .from('pagamentos_programa')
    .select('data_pagamento,valor,conta_como_programa')
    .eq('base_qv_id', id);
  const rd = responseDate;
  const meetBefore = (reunioes ?? []).filter((r) => String(r.inicio_brasilia).slice(0, 10) <= rd);
  const payBefore = (pag ?? []).filter(
    (p) => p.conta_como_programa === true && String(p.data_pagamento).slice(0, 10) <= rd,
  );
  const amount = payBefore.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  return {
    client: cl[0].nome,
    response_date: responseDate,
    meetings_ok: meetBefore.length === row.meetings_before_response,
    payments_ok:
      payBefore.length === row.payments_before_response &&
      Math.abs(amount - row.amount_paid_before_response) < 0.02,
    meetings_after_leak: (reunioes ?? []).filter((r) => String(r.inicio_brasilia).slice(0, 10) > rd).length,
  };
}

const clients = [
  { key: 'A', name: 'Jane Cronst', id: 'eedd4b83-8924-49b4-bbb3-a4ab8f2a2078' },
  { key: 'B', name: 'Carlos D G de Magalhães', id: '1b5737cf-9f06-48ef-aeb7-533921707e0f' },
  { key: 'C', name: 'Rodrigo Orlando Martins', id: '00df8ea6-d066-46b9-9015-da27406f8666' },
  { key: 'D', name: 'Danilo Soares Santana', id: '09ed4608-b617-40ce-b43a-88b99043e3b3' },
  { key: 'E', name: 'Julio Sassi', id: '11151df2-cae1-4972-94ec-c50ecf79c2ca' },
];

const rows = enriched.responses;
const manual = [];
for (const c of clients) {
  const rs = rows.filter((r) => r.client_id === c.id);
  const cohort = cohorts.find((x) => x.client_id === c.id);
  const last = rs[rs.length - 1];
  manual.push({
    profile: c.key,
    client_name: c.name,
    client_id: c.id,
    n_responses: rs.length,
    payment_entry_date: last?.payment_entry_date ?? cohort?.payment_entry_date,
    safra_trimestre: last?.safra_trimestre ?? cohort?.safra_trimestre,
    safra_ano: cohort?.safra_ano ?? last?.safra_mes?.slice(0, 4),
    invalid_future: last?.invalid_future_entry_date ?? cohort?.invalid_future_entry_date,
    pit_sample: last ? await pitCheck(c.id, last.response_date, last) : null,
  });
}

const official = [
  ['2025-Q2', 21.3],
  ['2025-Q3', 24.0],
  ['2025-Q4', 35.1],
  ['2026-Q1', 45.9],
  ['2026-Q2', 68.7],
  ['2026-Q3', 59.6],
];
const offMap = new Map(
  summary.summary.cycles.filter((c) => c.is_official).map((c) => [c.ciclo, c.nps_oficial]),
);
const official_ok = official.every(([c, n]) => Math.abs((offMap.get(c) ?? NaN) - n) < 0.05);

const report = {
  generated_at: new Date().toISOString(),
  manual_clients: manual,
  official_nps_ok: official_ok,
  safras_2027: cohorts.filter((c) => String(c.safra_trimestre ?? '').startsWith('2027')).length,
  enriched_rows: rows.length,
  quality: JSON.parse(readFileSync('data/quality/historical_nps_enriched_quality.json', 'utf8')),
  named_safras: ['Pedro Sesar Junior', 'Pollyana Cristina', 'Rafael Baima de Melo Lima'].map((n) => {
    const x = cohorts.find((c) => c.client_name === n);
    return { name: n, safra: x?.safra_trimestre, payment: x?.payment_entry_date };
  }),
};

console.log(JSON.stringify(report, null, 2));
