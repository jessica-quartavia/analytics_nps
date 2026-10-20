import { getNpsChangeDrivers, hasNpsChangeDrivers } from '../data/analytics-store.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatNps, formatPct } from '../utils/format.js';
import { sectionHead } from '../ui/help.js';

function qualityBadge(quality) {
  const labels = { good: 'Boa cobertura', partial: 'Parcial', low: 'Baixa', unknown: '—' };
  const cls =
    quality === 'good' ? 'badge--ok' : quality === 'partial' ? 'badge--warn' : 'badge--muted';
  return `<span class="badge ${cls}">${escapeHtml(labels[quality] ?? quality)}</span>`;
}

function fmtMed(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(1);
}

/** Linhas padronizadas: métrica · grupo · n · resultado · interpretação (associação, não causalidade). */
function renderDriverInsightRows(rows) {
  if (!rows?.length) return '';
  const body = rows
    .map(
      (r) =>
        `<tr>
          <th scope="row">${escapeHtml(r.metric)}</th>
          <td>${escapeHtml(r.group)}</td>
          <td class="num">${r.n ?? '—'}</td>
          <td>${escapeHtml(r.result)}</td>
          <td class="note-muted">${escapeHtml(r.interpretation)}</td>
        </tr>`,
    )
    .join('');
  return `
    <div class="table-scroll driver-insight-table">
      <table class="gd-table gd-table--compact">
        <thead><tr><th>Métrica</th><th>Grupo comparado</th><th>n</th><th>Resultado</th><th>Interpretação</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderMeetingsBlock(meetings, coverage) {
  const byEv = meetings?.by_evolution ?? {};
  const cov = coverage?.fields?.meetings_between;
  let rows = '';
  for (const group of ['Melhora', 'Estável', 'Queda']) {
    const m = byEv[group]?.meetings_between;
    if (!m) continue;
    rows += `<tr><th scope="row">${escapeHtml(group)}</th>
      <td class="num">${m.n_with_value}/${m.n}</td>
      <td class="num">${fmtMed(m.mean)}</td>
      <td class="num">${fmtMed(m.median)}</td>
      <td class="num">${fmtMed(m.iqr)}</td></tr>`;
  }
  const h1 = meetings?.tests?.H1_meetings_between_queda_vs_melhora;
  const pNote =
    h1?.p_value != null
      ? `<p class="note-muted">H1 (Queda vs Melhora, reuniões entre ciclos): p≈${Number(h1.p_value).toFixed(3)} · n queda ${h1.n_queda ?? '—'} · n melhora ${h1.n_melhora ?? '—'}</p>`
      : '';

  const insightRows = [];
  for (const group of ['Melhora', 'Estável', 'Queda']) {
    const m = byEv[group]?.meetings_between;
    if (!m) continue;
    insightRows.push({
      metric: 'Reuniões entre as duas respostas',
      group,
      n: m.n,
      result: `média ${fmtMed(m.mean)} · mediana ${fmtMed(m.median)} · IQR ${fmtMed(m.iqr)}`,
      interpretation:
        'Descritivo na base pareada; diferenças entre grupos não provam que reuniões causam mudança de NPS.',
    });
  }

  return `
    <article class="card change-driver-card">
      <h3>Reuniões entre ciclos ${cov ? qualityBadge(cov.quality) : ''}</h3>
      <p class="note-muted">Mede reuniões estritamente entre a resposta anterior e a resposta atual (pareados). IQR = intervalo entre Q1 e Q3 (50% centrais).</p>
      ${renderDriverInsightRows(insightRows)}
      <div class="table-scroll"><table class="gd-table gd-table--compact">
        <thead><tr><th>Evolução</th><th>Cobertura</th><th>Média</th><th>Mediana</th><th>IQR</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Sem dados</td></tr>'}</tbody>
      </table></div>
      ${pNote}
    </article>`;
}

function renderMechanismsBlock(mechanisms, coverage) {
  const by = mechanisms?.by_mechanism_count_before_response ?? {};
  const cov = coverage?.fields?.mechanisms_before_response;
  let rows = '';
  for (const b of ['0', '1', '2+']) {
    const c = by[b];
    if (!c) continue;
    rows += `<tr><th scope="row">${escapeHtml(b)} mecanismo(s)</th>
      <td class="num">n=${c.n}</td>
      <td class="num">${c.nps != null ? formatNps(c.nps) : '—'}</td>
      <td class="num">${fmtMed(c.mean_score)}</td>
      <td class="num">${c.pct_detractors != null ? formatPct(c.pct_detractors, 0) : '—'}</td>
      <td class="num">${fmtMed(c.mean_delta)}</td></tr>`;
  }
  const added = mechanisms?.mechanism_added_between_cycles;
  const addedRow =
    added?.true?.n != null
      ? `<p class="note-muted">Mecanismo entre ciclos: sim n=${added.true.n} (Δ médio ${fmtMed(added.true.mean_delta)}) · não n=${added.false?.n ?? 0}</p>`
      : '';

  const mechInsights = [];
  for (const b of ['0', '1', '2+']) {
    const c = by[b];
    if (!c) continue;
    mechInsights.push({
      metric: 'Mecanismos até a resposta atual',
      group: `${b} mecanismo(s)`,
      n: c.n,
      result: `NPS ${c.nps != null ? formatNps(c.nps) : '—'} · Δ médio ${fmtMed(c.mean_delta)}`,
      interpretation: 'Corte por contagem PIT; comparação entre faixas é associativa.',
    });
  }

  return `
    <article class="card change-driver-card">
      <h3>Mecanismos ${cov ? qualityBadge(cov.quality) : ''}</h3>
      ${renderDriverInsightRows(mechInsights)}
      <div class="table-scroll"><table class="gd-table gd-table--compact">
        <thead><tr><th>Faixa</th><th>n</th><th>NPS</th><th>Nota média</th><th>% detratores</th><th>Δ médio</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Sem dados</td></tr>'}</tbody>
      </table></div>
      ${addedRow}
    </article>`;
}

function renderEpBlock(epChange) {
  const t = epChange?.changed_ep_between_cycles?.true;
  const f = epChange?.changed_ep_between_cycles?.false;
  if (!t && !f) return '';
  const epInsights = [
    {
      metric: 'Trocou de EP entre respostas',
      group: 'Sim',
      n: t?.n ?? 0,
      result: `Δ médio ${fmtMed(t?.mean_delta)} · % piora ${t?.pct_worse != null ? formatPct(t.pct_worse, 0) : '—'}`,
      interpretation: 'Eventos de transferência entre submitted_at anterior e atual; não usar EP atual como proxy.',
    },
    {
      metric: 'Trocou de EP entre respostas',
      group: 'Não',
      n: f?.n ?? 0,
      result: `Δ médio ${fmtMed(f?.mean_delta)} · % piora ${f?.pct_worse != null ? formatPct(f.pct_worse, 0) : '—'}`,
      interpretation: 'Grupo de referência sem troca no intervalo entre respostas.',
    },
  ];

  return `
    <article class="card change-driver-card">
      <h3>Troca de EP entre respostas</h3>
      ${renderDriverInsightRows(epInsights)}
      <div class="table-scroll"><table class="gd-table gd-table--compact">
        <thead><tr><th>Trocou EP</th><th>n</th><th>Δ médio</th><th>% piora</th><th>% recuperação</th></tr></thead>
        <tbody>
          <tr><td>Sim</td><td class="num">${t?.n ?? 0}</td><td class="num">${fmtMed(t?.mean_delta)}</td><td class="num">${t?.pct_worse != null ? formatPct(t.pct_worse, 0) : '—'}</td><td class="num">${t?.pct_recovery != null ? formatPct(t.pct_recovery, 0) : '—'}</td></tr>
          <tr><td>Não</td><td class="num">${f?.n ?? 0}</td><td class="num">${fmtMed(f?.mean_delta)}</td><td class="num">${f?.pct_worse != null ? formatPct(f.pct_worse, 0) : '—'}</td><td class="num">${f?.pct_recovery != null ? formatPct(f.pct_recovery, 0) : '—'}</td></tr>
        </tbody>
      </table></div>
    </article>`;
}

function renderChurnBlock(churn) {
  const partial = churn?.quality !== 'complete' || !churn?.show_managerial_conclusion;
  const by = churn?.by_churn_requested;
  const coverage = churn?.coverage ?? churn?.field_coverage;
  if (!by) {
    return `
      <article class="card change-driver-card card--muted">
        <h3>Churn <span class="badge badge--warn">Dados insuficientes</span></h3>
        <p class="note-muted">Fonte/join de solicitação de cancelamento indisponível ou amostra insuficiente na base pareada. Não usar como KPI principal.</p>
        ${coverage ? `<p class="note-muted">Cobertura: ${escapeHtml(JSON.stringify(coverage))}</p>` : ''}
      </article>`;
  }
  const nReq = by.requested?.n ?? 0;
  const nNot = by.not_requested?.n ?? 0;
  if (nReq + nNot === 0) {
    return `
      <article class="card change-driver-card card--muted">
        <h3>Churn</h3>
        <p class="note-muted">Dados insuficientes — n=0 na comparação pedido vs não pedido.</p>
      </article>`;
  }
  const churnInsights = [
    {
      metric: 'Solicitação de cancelamento antes da resposta atual',
      group: 'Sim',
      n: by.requested?.n ?? 0,
      result: `NPS ${by.requested?.nps != null ? formatNps(by.requested.nps) : '—'} · Δ ${fmtMed(by.requested?.mean_delta)}`,
      interpretation: 'Pedido registrado em cancellations (PIT); não confundir com churn efetivado.',
    },
    {
      metric: 'Solicitação de cancelamento antes da resposta atual',
      group: 'Não',
      n: by.not_requested?.n ?? 0,
      result: `NPS ${by.not_requested?.nps != null ? formatNps(by.not_requested.nps) : '—'} · Δ ${fmtMed(by.not_requested?.mean_delta)}`,
      interpretation: 'Referência sem pedido antes da resposta na janela pareada.',
    },
  ];

  return `
    <article class="card change-driver-card">
      <h3>Churn ${partial ? '<span class="badge badge--warn">Parcial</span>' : qualityBadge('good')}</h3>
      ${partial ? '<p class="note-muted">Dados exploratórios apenas — não usar como insight principal.</p>' : ''}
      ${renderDriverInsightRows(churnInsights)}
      <div class="table-scroll"><table class="gd-table gd-table--compact">
        <thead><tr><th>Pedido antes da resposta</th><th>n</th><th>NPS</th><th>Δ médio</th></tr></thead>
        <tbody>
          <tr><td>Sim</td><td class="num">${by.requested?.n ?? 0}</td><td class="num">${by.requested?.nps != null ? formatNps(by.requested.nps) : '—'}</td><td class="num">${fmtMed(by.requested?.mean_delta)}</td></tr>
          <tr><td>Não</td><td class="num">${by.not_requested?.n ?? 0}</td><td class="num">${by.not_requested?.nps != null ? formatNps(by.not_requested.nps) : '—'}</td><td class="num">${fmtMed(by.not_requested?.mean_delta)}</td></tr>
        </tbody>
      </table></div>
    </article>`;
}

function renderResultadosInsight(r) {
  if (!r?.resultados_negative) return '';
  const neg = r.resultados_negative;
  const oth = r.others;
  return `
    <article class="card change-driver-card">
      <h3>Resultados (VoC) × mecanismos</h3>
      <p class="note-muted">${escapeHtml(r.question ?? '')}</p>
      <div class="table-scroll"><table class="gd-table gd-table--compact">
        <thead><tr><th>Grupo</th><th>n</th><th>Mediana mecanismos</th><th>% sem</th><th>% 1</th><th>% 2+</th><th>NPS</th></tr></thead>
        <tbody>
          <tr><td>Tema Resultados negativo</td><td class="num">${neg.n}</td><td class="num">${fmtMed(neg.median_mechanisms)}</td><td class="num">${neg.pct_no_mechanism != null ? formatPct(neg.pct_no_mechanism, 0) : '—'}</td><td class="num">${neg.pct_one != null ? formatPct(neg.pct_one, 0) : '—'}</td><td class="num">${neg.pct_two_plus != null ? formatPct(neg.pct_two_plus, 0) : '—'}</td><td class="num">${neg.nps != null ? formatNps(neg.nps) : '—'}</td></tr>
          <tr><td>Demais</td><td class="num">${oth?.n ?? 0}</td><td class="num">${fmtMed(oth?.median_mechanisms)}</td><td class="num">${oth?.pct_no_mechanism != null ? formatPct(oth.pct_no_mechanism, 0) : '—'}</td><td class="num">${oth?.pct_one != null ? formatPct(oth.pct_one, 0) : '—'}</td><td class="num">${oth?.pct_two_plus != null ? formatPct(oth.pct_two_plus, 0) : '—'}</td><td class="num">${oth?.nps != null ? formatNps(oth.nps) : '—'}</td></tr>
        </tbody>
      </table></div>
    </article>`;
}

function renderInsights(list) {
  if (!list?.length) return '<p class="note-muted">Nenhum insight automático atende critérios de n, efeito e cobertura.</p>';
  return `<ul class="insight-list">${list.map((i) => `<li>${escapeHtml(i.text)} <span class="note-muted">(${qualityBadge(i.quality)}, n≈${i.n})</span></li>`).join('')}</ul>`;
}

export function renderMovimentoChangeDriversSection() {
  if (!hasNpsChangeDrivers()) {
    return '';
  }
  const doc = getNpsChangeDrivers();
  const meta = doc?.meta ?? {};
  const cov = doc?.coverage ?? {};

  const evo = doc?.evolution_groups ?? {};
  const evoLine = ['Melhora', 'Estável', 'Queda']
    .map((k) => `${k} n=${evo[k]?.n ?? 0}`)
    .join(' · ');

  return `
    <div id="movimento-change-drivers">
    ${sectionHead(
      'Fatores associados à mudança',
      'Base pareada PHARUS — associação, não causalidade',
      'Reuniões, mecanismos, EP, churn (se disponível) e cruzamentos VoC × jornada entre ciclos.',
    )}
    <p class="note-muted">${escapeHtml(evoLine)} · ${meta.paired_transitions ?? 0} transições (${escapeHtml(meta.current_cycle ?? '')})</p>
    <div class="grid grid--2 change-drivers-grid">
      ${renderMeetingsBlock(doc.meetings, cov)}
      ${renderMechanismsBlock(doc.mechanisms, cov)}
      ${renderEpBlock(doc.ep_change)}
      ${renderChurnBlock(doc.churn)}
    </div>
    <p class="note-muted">VoC × mecanismos (perfil estático): ver <a href="#/jornada-perfil?tema=Resultados&amp;valencia=Negativa">Jornada &amp; Perfil · Temas × perfil</a>.</p>
    </div>
  `;
}

export function bindMovimentoChangeDrivers() {
  /* somente leitura */
}
