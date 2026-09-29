import { getNpsFinancialProfile, hasNpsFinancialProfile } from '../data/analytics-store.js';
import { filterFinancialDoc } from '../data/jornada-perfil-view.mjs';
import { escapeHtml } from '../utils/escape-html.js';
import { formatNps, formatPct } from '../utils/format.js';
import { sectionHead, helpTip } from '../ui/help.js';
import { cellClients, cellNpsStack, cellPlainNum, tdNumericStack } from '../ui/analytics-table.mjs';

const TIER_RULES_TIP =
  'T1: renda ≥ R$100 mil/mês OU aporte ≥ R$30 mil/mês OU reserva ≥ R$500 mil. ' +
  'T2: R$50 mil ≤ renda < R$100 mil. T3: R$20 mil ≤ renda < R$50 mil. T4: renda < R$20 mil. ' +
  'Débitos: analisados separadamente do Tier.';

const DEBTS_RULES_TIP =
  'Classificação “Com indicador de débito” quando há ao menos um sinal registrado: cheque especial, parcelamento de cartão, crédito pessoal ou crédito consignado. ' +
  'Indica presença de sinais, não valor total nem consolidação completa das dívidas.';

const FINANCIAL_SOURCE_TIP = 'Os dados desta versão vêm de export auxiliar versionado.';

function qualityBadge(quality) {
  const labels = { good: 'Boa cobertura', partial: 'Cobertura parcial', low: 'Dados insuficientes', unknown: '—' };
  const cls =
    quality === 'good' ? 'badge--ok' : quality === 'partial' ? 'badge--warn' : 'badge--muted';
  return `<span class="badge ${cls}">${escapeHtml(labels[quality] ?? quality)}</span>`;
}

function fmtMed(v) {
  return v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function fmtP(v) {
  return v == null ? '—' : Number(v).toFixed(3);
}

function renderNpsByTier(npsByTier) {
  const tiers = ['T1', 'T2', 'T3', 'T4', 'unavailable'];
  let rows = '';
  for (const t of tiers) {
    const s = npsByTier?.[t];
    if (!s?.n) continue;
    rows += `<tr><th scope="row" class="col-label col-tier-label">${escapeHtml(t === 'unavailable' ? 'Unavailable' : t)}</th>`;
    rows += cellClients(s.n);
    rows += cellNpsStack(s.nps, s.nps_ci_low, s.nps_ci_high);
    rows += cellPlainNum(s.mean_score, 1);
    rows += cellPlainNum(s.median_score, 1);
    rows += `<td class="num">${s.pct_promoters != null ? formatPct(s.pct_promoters, 0) : '—'}</td>`;
    rows += `<td class="num">${s.pct_neutrals != null ? formatPct(s.pct_neutrals, 0) : '—'}</td>`;
    rows += `<td class="num">${s.pct_detractors != null ? formatPct(s.pct_detractors, 0) : '—'}</td></tr>`;
  }
  return `
    <article class="card change-driver-card">
      <h3>NPS por Tier</h3>
      <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table analytic-table--tier-nps">
        <thead><tr><th class="col-label col-tier-label">Tier</th><th class="num col-number col-tier-num">Clientes</th><th class="num col-number col-tier-num">NPS</th><th class="num col-number col-tier-num">Nota média</th><th class="num col-number col-tier-num">Mediana</th><th class="num col-percent col-tier-num">Promotores</th><th class="num col-percent col-tier-num">Neutros</th><th class="num col-percent col-tier-num">Detratores</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">Sem dados</td></tr>'}</tbody>
      </table></div>
    </article>`;
}

function renderResultadosTier(block) {
  const tiers = ['T1', 'T2', 'T3', 'T4'];
  let rows = '';
  for (const t of tiers) {
    const negN = block?.resultados_negative?.counts?.[t] ?? 0;
    const negPct =
      block?.resultados_negative?.pct?.[t] != null ? formatPct(block.resultados_negative.pct[t], 0) : '—';
    const othN = block?.others?.counts?.[t] ?? 0;
    const othPct = block?.others?.pct?.[t] != null ? formatPct(block.others.pct[t], 0) : '—';
    rows += `<tr><th scope="row" class="col-label col-tier">${t}</th>`;
    rows += tdNumericStack(negN, negPct, 'num col-number col-percent col-resultados');
    rows += tdNumericStack(othN, othPct, 'num col-number col-percent col-demais');
    rows += '</tr>';
  }
  const p = block?.association?.p_value;
  const testName = block?.association?.test ?? '—';
  const testLabel =
    testName.toLowerCase().includes('chi') ? 'Qui-quadrado' : testName;
  return `
    <article class="card change-driver-card">
      <h3>Resultados × Tier</h3>
      <p class="note-muted">${escapeHtml(block?.question ?? '')}</p>
      <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table resultados-tier-table"><colgroup>
        <col style="width:24%" /><col style="width:38%" /><col style="width:38%" />
      </colgroup>
        <thead><tr><th class="col-label col-tier">Tier</th><th class="num col-number col-resultados">Resultados negativo</th><th class="num col-number col-demais">Demais</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="stat-evidence-block" role="note">
        <h4 class="stat-evidence-block__title">Evidência estatística</h4>
        <p class="stat-evidence-block__body">${escapeHtml(testLabel)} · p = ${fmtP(p)} · n neg=${block?.resultados_negative?.n ?? 0} · demais=${block?.others?.n ?? 0}</p>
      </div>
    </article>`;
}

function renderReserveContribution(reserve, contribution) {
  return `
    <article class="card change-driver-card">
      <h3>Reserva e aporte (Resultados negativo vs demais)</h3>
      <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table">
        <thead><tr><th class="col-label">Métrica</th><th class="col-number">Mediana neg.</th><th class="col-number">Mediana demais</th><th class="col-number">IQR neg.</th><th class="col-number">IQR demais</th><th class="col-number">p (MWU)</th></tr></thead>
        <tbody>
          <tr><th scope="row">Reserva</th>
            <td class="num">${fmtMed(reserve?.median_negative)}</td>
            <td class="num">${fmtMed(reserve?.median_others)}</td>
            <td class="num">${fmtMed(reserve?.iqr_negative)}</td>
            <td class="num">${fmtMed(reserve?.iqr_others)}</td>
            <td class="num">${fmtP(reserve?.mann_whitney?.p_value)}</td></tr>
          <tr><th scope="row">Aporte (proxy)</th>
            <td class="num">${fmtMed(contribution?.median_negative)}</td>
            <td class="num">${fmtMed(contribution?.median_others)}</td>
            <td class="num">${fmtMed(contribution?.iqr_negative)}</td>
            <td class="num">${fmtMed(contribution?.iqr_others)}</td>
            <td class="num">${fmtP(contribution?.mann_whitney?.p_value)}</td></tr>
        </tbody>
      </table></div>
      <p class="note-muted">${escapeHtml(contribution?.note ?? '')}</p>
    </article>`;
}

function renderDebts(debtsVs, resultadosDebts) {
  const t = debtsVs?.debts_true;
  const f = debtsVs?.debts_false;
  const debtRow = (label, s) => {
    let row = `<tr><th scope="row">${escapeHtml(label)}</th>`;
    row += cellClients(s?.n ?? 0);
    row += cellNpsStack(s?.nps, null, null);
    row += cellPlainNum(s?.mean_score, 1);
    row += `<td class="num">${s?.pct_promoters != null ? formatPct(s.pct_promoters, 0) : '—'}</td>`;
    row += `<td class="num">${s?.pct_detractors != null ? formatPct(s.pct_detractors, 0) : '—'}</td></tr>`;
    return row;
  };
  return `
    <article class="card change-driver-card">
      <h3>${helpTip('Débitos', DEBTS_RULES_TIP, 'debitos')}</h3>
      <p class="debts-card__lead">Indicador baseado em sinais financeiros cadastrados.</p>
      <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table">
        <thead><tr><th class="col-label">Grupo</th><th class="num col-number">Clientes</th><th class="num col-number">NPS</th><th class="num col-number">Nota média</th><th class="num col-percent">Promotores</th><th class="num col-percent">Detratores</th></tr></thead>
        <tbody>
          ${debtRow('Com indicador de débito', t)}
          ${debtRow('Sem indicador de débito', f)}
        </tbody>
      </table></div>
      <p class="debts-card__note">Uma funcionalidade de consolidação de débitos está em implementação para aumentar a precisão dessa informação.</p>
      <p class="note-muted">Resultados neg.: ${resultadosDebts?.pct_debts_negative != null ? formatPct(resultadosDebts.pct_debts_negative, 0) : '—'} com indicador (n=${resultadosDebts?.n_negative ?? 0}) vs demais ${resultadosDebts?.pct_debts_others != null ? formatPct(resultadosDebts.pct_debts_others, 0) : '—'} · p≈${fmtP(resultadosDebts?.p_value)}</p>
    </article>`;
}

function renderTierMechanisms(block) {
  if (!block?.matrix?.length) return '';
  let rows = '';
  for (const row of block.matrix) {
    const b = row.by_mechanism_bucket ?? {};
    rows += `<tr><th scope="row">${escapeHtml(row.tier)}</th>`;
    rows += cellClients(row.n ?? 0);
    rows += `<td class="num">${b['0']?.shown !== false && b['0']?.pct != null ? formatPct(b['0'].pct, 0) : '—'}</td>`;
    rows += `<td class="num">${b['1']?.shown !== false && b['1']?.pct != null ? formatPct(b['1'].pct, 0) : '—'}</td>`;
    rows += `<td class="num">${b['2+']?.shown !== false && b['2+']?.pct != null ? formatPct(b['2+'].pct, 0) : '—'}</td></tr>`;
  }
  return `
    <article class="card change-driver-card">
      <h3>Tier × mecanismos</h3>
      <p class="note-muted">${escapeHtml(block.note ?? '')}</p>
      <div class="table-scroll"><table class="gd-table gd-table--compact analytic-table">
        <thead><tr><th class="col-label">Tier</th><th class="num col-number">Clientes</th><th class="num col-percent">0 mecanismos</th><th class="num col-percent">1 mecanismo</th><th class="num col-percent">2+ mecanismos</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </article>`;
}

function renderInsights(list) {
  if (!list?.length) return '<p class="note-muted">Nenhum insight automático atende critérios de cobertura, n e qualidade temporal.</p>';
  return `<ul class="insight-list">${list.map((i) => `<li>${escapeHtml(i.text)} <span class="note-muted">(n≈${i.n})</span></li>`).join('')}</ul>`;
}

export function renderJornadaFinancialProfileSection(filterCtx) {
  if (!hasNpsFinancialProfile()) return '';
  let doc = getNpsFinancialProfile();
  const clientSet = filterCtx?.recorteActive
    ? new Set((filterCtx.rowsCurrent ?? []).map((r) => r.client_id))
    : null;
  if (clientSet?.size) doc = filterFinancialDoc(doc, clientSet);
  const cov = doc?.financial_profile_coverage ?? {};
  const dist = cov.tier_distribution ?? {};
  const overlap = doc?.tier_t1_criteria_overlap ?? {};
  const temporal = cov.temporal_after_response_n != null
    ? ` · ${cov.temporal_after_response_n} linhas atualizadas após a resposta (${cov.temporal_after_response_pct?.toFixed(0) ?? '—'}%)`
    : '';

  const respTotal = cov.respondents_total ?? '—';
  const finRows = cov.financial_rows ?? respTotal;
  const t1Criteria = `
    <div class="tier-criteria-grid">
      <div class="tier-criteria-chip"><span class="tier-criteria-chip__label">Renda ≥ R$100 mil</span><span class="tier-criteria-chip__value">${overlap.income_ge_100k ?? '—'} clientes</span></div>
      <div class="tier-criteria-chip"><span class="tier-criteria-chip__label">Reserva ≥ R$500 mil</span><span class="tier-criteria-chip__value">${overlap.reserve_ge_500k ?? '—'} clientes</span></div>
      <div class="tier-criteria-chip"><span class="tier-criteria-chip__label">Aporte ≥ R$30 mil</span><span class="tier-criteria-chip__value">${overlap.contribution_ge_30k ?? '—'} clientes</span></div>
    </div>
    <p class="note-muted">${escapeHtml(overlap.note ?? 'Um mesmo cliente pode atender mais de um critério.')}</p>`;

  return `
    <section id="jornada-financial" class="jornada-section">
    <div class="financial-intro">
      ${sectionHead(
        'Perfil financeiro × NPS',
        'Tier derivado pela regra oficial de renda, aporte e reserva.',
        '',
      )}
      <div class="financial-intro__row">
        ${qualityBadge(cov.coverage_quality ?? 'good')}
        <p class="financial-intro__copy">${escapeHtml(String(finRows))} de ${escapeHtml(String(respTotal))} respondentes possuem dados financeiros no conjunto usado nesta análise.</p>
        ${helpTip('Como o Tier é calculado?', TIER_RULES_TIP, 'tier')}
        <span class="help-tip"><button type="button" class="help-tip__btn" aria-label="${escapeHtml(FINANCIAL_SOURCE_TIP)}" data-tip="${escapeHtml(FINANCIAL_SOURCE_TIP)}">?</button></span>
      </div>
    </div>
    ${filterCtx?.recorteActive ? '<p class="filter-recorte-banner" role="status"><strong>Recorte ativo</strong> — agregados financeiros recalculados para clientes filtrados.</p>' : ''}
    <p class="note-muted">Distribuição Tier: T1=${dist.T1 ?? 0} · T2=${dist.T2 ?? 0} · T3=${dist.T3 ?? 0} · T4=${dist.T4 ?? 0} · unavailable=${dist.unavailable ?? 0}${escapeHtml(temporal)}</p>
    ${t1Criteria}
    <div class="grid grid--2 change-drivers-grid">
      ${renderNpsByTier(doc.nps_by_tier)}
      ${renderTierMechanisms(doc.tier_x_mechanisms)}
      ${renderResultadosTier(doc.resultados_x_tier)}
      ${renderReserveContribution(doc.resultados_x_reserve, doc.resultados_x_contribution)}
      ${renderDebts(doc.debts_vs_nps, doc.resultados_x_debts)}
    </div>
    <div class="card">
      <h3>Associações automáticas</h3>
      ${renderInsights(doc.auto_insights)}
      ${doc.limitations?.length ? `<p class="note-muted"><strong>Limitações:</strong> ${escapeHtml(doc.limitations.join(' '))}</p>` : ''}
    </div>
    </section>`;
}

export function bindJornadaFinancialProfile() {}

/** @deprecated */
export function renderMovimentoFinancialProfileSection() {
  return renderJornadaFinancialProfileSection(null);
}

export function bindMovimentoFinancialProfile() {}
