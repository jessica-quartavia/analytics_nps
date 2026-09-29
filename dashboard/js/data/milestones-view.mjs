const CATEGORIES = ['Promotor', 'Neutro', 'Detrator'];

export function filterMilestoneEntries(entries, cycleCode, clientIdSet) {
  if (!clientIdSet?.size) return entries.filter((e) => e.analytical_cycle_code === cycleCode);
  return entries.filter(
    (e) => e.analytical_cycle_code === cycleCode && clientIdSet.has(e.client_id),
  );
}

function pct(rows, pred) {
  if (!rows.length) return null;
  let n = 0;
  for (const r of rows) if (pred(r)) n++;
  return (n / rows.length) * 100;
}

function meanOf(rows, field) {
  const xs = rows.map((r) => r[field]).filter((v) => v != null && !Number.isNaN(v));
  if (!xs.length) return { value: null, nValid: 0 };
  return {
    value: xs.reduce((a, b) => a + b, 0) / xs.length,
    nValid: xs.length,
  };
}

/** Matriz resumida recalculada no browser quando há recorte de filtros. */
export function buildLiveMilestoneMatrix(entries, cycleCode) {
  const matrix = [];
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, entries.filter((e) => e.nps_category === c)]));

  const rows = [
    { key: 'has_mechanism', label: 'Tem mecanismo', pred: (r) => r.has_mechanism_before_response === true },
    {
      key: 'mechanisms_2plus',
      label: 'Tem 2+ mecanismos',
      pred: (r) =>
        r.mechanisms_count_before_response != null && r.mechanisms_count_before_response >= 2,
    },
    { key: 'ever_ep', label: 'Já trocou de EP', pred: (r) => r.ever_changed_ep_before_response === true },
    { key: 'ep_since', label: 'Trocou de EP desde resposta anterior', pred: (r) => r.changed_ep_since_previous_response === true },
    { key: 'frozen', label: 'Estava congelado', pred: (r) => r.frozen_at_response === true },
    { key: 'churn', label: 'Já solicitou churn', pred: (r) => r.churn_requested_before_response === true },
    { key: 'app', label: 'Usa App PHARUS', pred: (r) => r.app_pharus_access === true },
  ];

  for (const spec of rows) {
    const item = { milestone_key: spec.key, label: spec.label, categories: {} };
    for (const cat of CATEGORIES) {
      const bucket = byCat[cat] ?? [];
      const n = bucket.filter(spec.pred).length;
      item.categories[cat] = { n, pct: bucket.length ? (n / bucket.length) * 100 : null };
    }
    matrix.push(item);
  }

  matrix.push({
    milestone_key: 'meetings_mean',
    label: 'Média de reuniões',
    categories: Object.fromEntries(
      CATEGORIES.map((cat) => {
        const stats = meanOf(byCat[cat] ?? [], 'meetings_count_before_response');
        return [cat, stats];
      }),
    ),
  });

  return { analytical_cycle_code: cycleCode, milestone_matrix: matrix, sample_n: entries.length };
}

export function filterBetweenEvents(events, clientIdSet, requirePaired) {
  let out = events ?? [];
  if (clientIdSet?.size) out = out.filter((e) => clientIdSet.has(e.client_id));
  return out;
}

export function migrationComparisonFromEvents(events, migrationA, migrationB) {
  const norm = (m) => (m ?? '').replace(/\s->\s/g, ' → ');
  const a = events.filter((e) => norm(e.migration) === norm(migrationA));
  const b = events.filter((e) => norm(e.migration) === norm(migrationB));
  return {
    migration_a: migrationA,
    migration_b: migrationB,
    n_a: a.length,
    n_b: b.length,
    pct_ep_a: pct(a, (r) => r.ep_changed),
    pct_ep_b: pct(b, (r) => r.ep_changed),
    clients_a: a,
    clients_b: b,
  };
}
