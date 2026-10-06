/**
 * Entrada analítica por data de pagamento (BASE0 Business Data).
 */
import { safraFromDate } from './customer-nps-cohorts.mjs';

export const PAYMENT_ENTRY_RULE =
  '1) MIN(base0.pagamentos_programa.data_pagamento) WHERE conta_como_programa=true AND base_qv_id matched; 2) fallback base0.clientes.data_pagamento_entrada';

export function parseDateOnly(v) {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function resolvePaymentEntryForClient({
  base_qv_id,
  codigo_cliente,
  nome,
  client_payment_date,
  fact_payment_date,
  currentDateIso,
}) {
  let payment_entry_date = null;
  let payment_entry_source = null;

  if (fact_payment_date) {
    payment_entry_date = fact_payment_date;
    payment_entry_source = 'pagamentos_programa.min';
  } else if (client_payment_date) {
    payment_entry_date = client_payment_date;
    payment_entry_source = 'clientes.data_pagamento_entrada';
  }

  const invalid_future_entry_date =
    payment_entry_date != null && payment_entry_date > currentDateIso;

  let safra = { safra_mes: null, safra_trimestre: null, safra_ano: null };
  if (payment_entry_date && !invalid_future_entry_date) {
    safra = safraFromDate(`${payment_entry_date}T12:00:00.000Z`);
  }

  const difference_days =
    client_payment_date && fact_payment_date
      ? Math.round(
          (Date.parse(fact_payment_date) - Date.parse(client_payment_date)) / 86400000,
        )
      : null;

  return {
    base_qv_id,
    codigo_cliente,
    nome,
    client_payment_date,
    fact_payment_date,
    difference_days,
    chosen_date: payment_entry_date,
    chosen_source: payment_entry_source,
    payment_entry_date,
    payment_entry_source,
    invalid_future_entry_date,
    ...safra,
  };
}

export async function fetchAllPaginated(sb, table, select, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

export async function loadPaymentEntryContext(sb, currentDateIso = new Date().toISOString().slice(0, 10)) {
  const clientes = await fetchAllPaginated(
    sb,
    'clientes',
    'base_qv_id,codigo_cliente,nome,data_pagamento_entrada,data_churn,ep,programa',
  );

  const pagamentos = await fetchAllPaginated(
    sb,
    'pagamentos_programa',
    'base_qv_id,data_pagamento,conta_como_programa',
  );

  const minFactByClient = new Map();
  for (const p of pagamentos) {
    if (p.conta_como_programa !== true || !p.base_qv_id) continue;
    const d = parseDateOnly(p.data_pagamento);
    if (!d) continue;
    const prev = minFactByClient.get(p.base_qv_id);
    if (!prev || d < prev) minFactByClient.set(p.base_qv_id, d);
  }

  const byClientId = new Map();
  const conflicts = [];
  const audit = {
    total_clients: clientes.length,
    with_payment_date: 0,
    without_payment_date: 0,
    future_payment_dates: 0,
    conflict_client_vs_fact: 0,
    recovered_from_payments: 0,
    invalid_dates: 0,
    future_cases: [],
    conflict_details: [],
  };

  for (const c of clientes) {
    const id = c.base_qv_id;
    if (!id) continue;
    const clientDate = parseDateOnly(c.data_pagamento_entrada);
    const factDate = minFactByClient.get(id) ?? null;
    const row = resolvePaymentEntryForClient({
      base_qv_id: id,
      codigo_cliente: c.codigo_cliente,
      nome: c.nome,
      client_payment_date: clientDate,
      fact_payment_date: factDate,
      currentDateIso,
    });
    byClientId.set(id, row);

    if (row.payment_entry_date) audit.with_payment_date += 1;
    else audit.without_payment_date += 1;
    if (row.invalid_future_entry_date) {
      audit.future_payment_dates += 1;
      if (audit.future_cases.length < 100) audit.future_cases.push(row);
    }
    if (clientDate && factDate && clientDate !== factDate) {
      audit.conflict_client_vs_fact += 1;
      conflicts.push(row);
      if (audit.conflict_details.length < 200) audit.conflict_details.push(row);
    }
    if (!clientDate && factDate) audit.recovered_from_payments += 1;
  }

  audit.dedupe_rule = PAYMENT_ENTRY_RULE;
  return { byClientId, audit, conflicts, clientesBase0: clientes };
}

export function tenureBucketAtResponse(days) {
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  if (days <= 90) return '0–3 meses';
  if (days <= 180) return '3–6 meses';
  if (days <= 365) return '6–12 meses';
  if (days <= 545) return '12–18 meses';
  if (days <= 730) return '18–24 meses';
  return '24+ meses';
}

export function meetingCountBucket(n) {
  if (n === 0) return '0';
  if (n <= 2) return '1–2';
  if (n <= 5) return '3–5';
  return '6+';
}

export function meetingRecencyBucket(days) {
  if (days == null) return 'Nunca teve reunião';
  if (days <= 30) return '0–30 dias';
  if (days <= 60) return '31–60 dias';
  if (days <= 90) return '61–90 dias';
  return '90+ dias';
}
