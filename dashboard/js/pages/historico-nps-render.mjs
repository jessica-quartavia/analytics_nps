import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatNps, formatPct, formatDate } from '../utils/format.js';
import { cycleSortKey } from '../utils/cycle-sort.mjs';
import { sampleBadgeHtml } from '../data/historico-nps-enriched-view.mjs';

export function renderHistoricoHeader(updatedLabel) {
  return `<header class="page-header historico-page-header">
    <div>
      <p class="eyebrow">PHARUS · Longitudinal</p>
      <h1>Histórico NPS</h1>
      <p class="page-lead">Evolução da satisfação ao longo do relacionamento com o cliente.</p>
      <p class="historico-page-header__note">Resultados oficiais por medição + análises derivadas por recorte.</p>
      <p class="historico-page-header__pit note-muted" title="Point-in-time">Análises de reuniões, mecanismos, pagamentos e transferências usam apenas eventos ocorridos até a data de cada resposta NPS.</p>
    </div>
    <div class="historico-page-header__badge">
      <span class="badge badge--coral-soft">Dados atualizados em ${escapeHtml(updatedLabel)}</span>
    </div>
  </header>`;
}

export function renderHistoricoFilters(pageFilters, opts) {
  const { ciclos, eps, safras, programas } = opts;
  const opt = (val, cur, label) =>
    `<option value="${escapeAttr(val)}" ${cur === val ? 'selected' : ''}>${escapeHtml(label ?? (val || 'Todos'))}</option>`;
  const f = pageFilters;
  return `<div class="card filters-panel historico-filters-card ${opts.stickyClass ?? ''}" data-hist-filters id="historico-page-filters">
    <div class="historico-filters-grid">
      <div class="filter-field"><label for="hf-ciclo">Ciclo</label><select id="hf-ciclo" class="select-input" data-f="ciclo">${opt('', f.ciclo, 'Todos')}${ciclos.map((c) => opt(c, f.ciclo, c)).join('')}</select></div>
      <div class="filter-field"><label for="hf-safra">Safra (pagamento)</label><select id="hf-safra" class="select-input" data-f="safra">${opt('', f.safra, 'Todas')}${safras.map((s) => opt(s, f.safra, s)).join('')}</select></div>
      <div class="filter-field"><label for="hf-tenure">Tempo de relacionamento</label><select id="hf-tenure" class="select-input" data-f="tenure">${opt('', f.tenure, 'Todos')}${['0–3 meses', '3–6 meses', '6–12 meses', '12–18 meses', '18–24 meses', '24+ meses'].map((t) => opt(t, f.tenure, t)).join('')}</select></div>
      <div class="filter-field"><label for="hf-prog">Programa</label><select id="hf-prog" class="select-input" data-f="programa">${opt('', f.programa, 'Todos')}${programas.map((p) => opt(p, f.programa, p)).join('')}</select></div>
      <div class="filter-field"><label for="hf-ep">EP</label><select id="hf-ep" class="select-input" data-f="ep">${opt('', f.ep, 'Todos')}${eps.map((e) => opt(e, f.ep, e)).join('')}</select></div>
      <div class="filter-field"><label for="hf-cat">Categoria NPS</label><select id="hf-cat" class="select-input" data-f="categoria">${opt('', f.categoria, 'Todas')}${['Promotor', 'Neutro', 'Detrator'].map((c) => opt(c, f.categoria, c)).join('')}</select></div>
      <div class="filter-field"><label for="hf-mec">Mecanismo (PIT)</label><select id="hf-mec" class="select-input" data-f="mechanism">${opt('', f.mechanism, 'Todos')}${opt('yes', f.mechanism, 'Com implementado')}${opt('no', f.mechanism, 'Sem implementado')}</select></div>
      <div class="filter-field"><label for="hf-meet">Qtd reuniões</label><select id="hf-meet" class="select-input" data-f="meetings">${opt('', f.meetings, 'Todas')}${['0', '1–2', '3–5', '6+'].map((m) => opt(m, f.meetings, m)).join('')}</select></div>
      <div class="filter-field"><label for="hf-eptr">Troca de EP</label><select id="hf-eptr" class="select-input" data-f="epTransfers">${opt('', f.epTransfers, 'Todas')}${opt('0', f.epTransfers, '0 trocas')}${opt('1', f.epTransfers, '1 troca')}${opt('2+', f.epTransfers, '2+')}</select></div>
      <div class="filter-field"><label for="hf-rec">Recorrência</label><select id="hf-rec" class="select-input" data-f="recorrencia">${opt('', f.recorrencia, 'Todos')}${opt('1', f.recorrencia, '1 resposta')}${opt('2', f.recorrencia, '2 respostas')}${opt('3+', f.recorrencia, '3+ respostas')}</select></div>
      <div class="filter-field historico-filters-grid__search"><label for="hf-search">Busca cliente</label><input id="hf-search" type="search" class="text-input" data-f="search" value="${escapeAttr(f.search)}" placeholder="Buscar cliente…" autocomplete="off" /></div>
    </div>
    <div class="filters-panel__actions">
      <button type="button" class="btn btn--ghost btn--sm" data-hist-clear-filters>Limpar filtros</button>
    </div>
  </div>`;
}

export function historicoKpiCard(label, valueHtml, metaHtml = '', extraClass = '', opts = {}) {
  const metaBlock = metaHtml
    ? `<span class="historico-kpi-card__meta">${opts.rawMeta ? metaHtml : escapeHtml(metaHtml)}</span>`
    : '';
  return `<article class="historico-kpi-card ${extraClass}">
    <span class="historico-kpi-card__label">${escapeHtml(label)}</span>
    <span class="historico-kpi-card__value">${valueHtml}</span>
    ${metaBlock}
  </article>`;
}

export function renderTenureBars(data) {
  const order = ['0–3 meses', '3–6 meses', '6–12 meses', '12–18 meses', '18–24 meses', '24+ meses'];
  const rows = order
    .filter((k) => data[k])
    .map((k) => {
      const v = data[k];
      return `<div class="historico-tenure-row">
        <span class="historico-tenure-row__label">${escapeHtml(k)} ${sampleBadgeHtml(v.n)}</span>
        <span class="historico-tenure-row__n">${v.n}</span>
        <span class="historico-tenure-row__nps">${v.nps != null ? formatNps(v.nps) : '—'}</span>
      </div>`;
    })
    .join('');
  return `<div class="historico-tenure-bars">${rows || '<p class="note-muted">Sem dados no recorte.</p>'}</div>`;
}

export function renderBucketTable(title, lead, buckets, order) {
  const rows = order
    .filter((k) => buckets[k])
    .map((k) => {
      const v = buckets[k];
      return `<tr><td>${escapeHtml(k)} ${sampleBadgeHtml(v.n)}</td><td class="num">${v.n}</td><td class="num">${v.nps != null ? formatNps(v.nps) : '—'}</td><td class="num">${v.avg ?? '—'}</td></tr>`;
    })
    .join('');
  return `<div class="safras-section-card historico-section-card">
    <div class="safras-section-card__head"><h2 class="safras-section-card__title">${escapeHtml(title)}</h2><p class="safras-section-card__lead">${escapeHtml(lead)}</p></div>
    <div class="table-shell"><table class="data-table safras-data-table"><thead><tr><th>Faixa</th><th class="num">N</th><th class="num">NPS</th><th class="num">Nota média</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sem dados</td></tr>'}</tbody></table></div>
  </div>`;
}

export function renderMechanismSection(mech, analysesFallback) {
  const com = mech.com;
  const sem = mech.sem;
  const unavail = mech.dateUnavailable;
  const comNps = analysesFallback?.com_implementado;
  const semNps = analysesFallback?.sem_implementado;
  return `<div class="safras-section-card historico-section-card">
    <div class="safras-section-card__head"><h2 class="safras-section-card__title">Mecanismos × NPS (point-in-time)</h2>
      <p class="safras-section-card__lead">Comparação apenas entre respostas com data de mecanismo conhecida. Não somar categorias abaixo.</p></div>
    <div class="historico-mech-compare">
      <div class="historico-mech-col"><h3>Com mecanismo implementado</h3><p class="historico-mech-stat">N=${com} · NPS ${comNps?.nps != null ? formatNps(comNps.nps) : '—'} · média ${comNps?.avg ?? '—'}</p></div>
      <div class="historico-mech-col"><h3>Sem mecanismo implementado</h3><p class="historico-mech-stat">N=${sem} · NPS ${semNps?.nps != null ? formatNps(semNps.nps) : '—'} · média ${semNps?.avg ?? '—'}</p></div>
    </div>
    <p class="historico-quality-note note-muted">${unavail} resposta(s) com informação de mecanismo sem data confiável — excluídas da comparação acima.</p>
  </div>`;
}

export function renderCollapsibleSection(title, lead, body, open = false) {
  return `<div class="safras-section-card historico-section-card"><details ${open ? 'open' : ''}>
    <summary><strong>${escapeHtml(title)}</strong> — ${escapeHtml(lead)}</summary>
    <div class="historico-collapsible-body">${body}</div>
  </details></div>`;
}

export function renderOfficialTable(cycles) {
  const rows = (cycles ?? [])
    .slice()
    .sort((a, b) => cycleSortKey(a.ciclo) - cycleSortKey(b.ciclo))
    .map(
      (c) => `<tr>
      <td>${escapeHtml(c.ciclo)}</td>
      <td>${escapeHtml(c.periodo ?? '—')}</td>
      <td class="num">${c.respostas ?? c.respostas_derivadas ?? '—'}${c.is_official ? ' <span class="note-muted" title="Oficial">●</span>' : ''}</td>
      <td class="num">${c.promotores ?? '—'}</td>
      <td class="num">${c.neutros ?? '—'}</td>
      <td class="num">${c.detratores ?? '—'}</td>
      <td class="num">${c.nps_oficial != null ? formatNps(c.nps_oficial) : '—'}</td>
      <td class="num">${c.nota_media ?? '—'}</td>
      <td class="num">${c.variacao_vs_anterior != null ? formatNps(c.variacao_vs_anterior) : '—'}</td>
    </tr>`,
    )
    .join('');
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Histórico oficial</h2><p class="safras-section-card__lead">Valores de nps_historico.medicoes (●). NPS do recorte filtrado aparece nos gráficos quando há filtros.</p></div>
    <div class="table-shell table-shell--scroll"><table class="data-table safras-data-table"><thead><tr>
      <th>Ciclo</th><th>Período</th><th class="num">Respostas</th><th class="num">Prom.</th><th class="num">Neut.</th><th class="num">Det.</th>
      <th class="num">NPS oficial</th><th class="num">Nota média</th><th class="num">Δ anterior</th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

export function renderQualityFooter(audit, quality, snapshotLabel) {
  const q = quality ?? {};
  const a = audit ?? {};
  return `<div class="safras-section-card safras-quality-card"><details>
    <summary>Qualidade dos dados</summary>
    <div class="safras-quality-grid historico-quality-grid">
      <div class="safras-quality-item"><strong>Snapshot BASE QV</strong><br>${escapeHtml(snapshotLabel)}</div>
      <div class="safras-quality-item"><strong>Clientes BASE0</strong><br>${a.total_clients ?? '—'}</div>
      <div class="safras-quality-item"><strong>Payment entry</strong><br>${a.with_payment_date ?? '—'}</div>
      <div class="safras-quality-item"><strong>Sem payment entry</strong><br>${a.without_payment_date ?? '—'}</div>
      <div class="safras-quality-item"><strong>Datas futuras</strong><br>${a.future_payment_dates ?? 0}</div>
      <div class="safras-quality-item"><strong>Safras 2027</strong><br>0</div>
      <div class="safras-quality-item"><strong>Reuniões PIT</strong><br>${q.responses_with_meetings_pit ?? '—'}/${q.responses_total ?? '—'}</div>
      <div class="safras-quality-item"><strong>Mecanismos c/ data</strong><br>${q.responses_with_mechanism_dates ?? '—'}</div>
      <div class="safras-quality-item"><strong>EP history PIT</strong><br>${q.responses_with_ep_transfer_history ?? '—'}</div>
      <div class="safras-quality-item"><strong>Financeiro PIT</strong><br>${q.responses_with_payment_history ?? '—'}/${q.responses_total ?? '—'}</div>
      <div class="safras-quality-item"><strong>Leakage temporal</strong><br>${q.pit_leakage_checks?.passed ? 'passed' : 'review'}</div>
    </div>
  </details></div>`;
}

export function renderClientExplorerTable(rows, page, pageSize) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(page, pages);
  const start = (p - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  const tbody = slice
    .map((c) => {
      const mech =
        c.mechanism_status === 'date_unavailable'
          ? 'Data indisponível'
          : c.mechanism_last
            ? 'Sim'
            : 'Não';
      return `<tr class="safras-explorer-table__row--clickable historico-client-row" data-client-id="${escapeAttr(c.client_id)}" tabindex="0" role="button">
        <td>${escapeHtml(c.client_name)}</td>
        <td>${escapeHtml(c.safra_trimestre ?? '—')}</td>
        <td class="col-date">${c.payment_entry_date ? formatDate(c.payment_entry_date) : '—'}</td>
        <td class="num">${c.months_since_entry != null ? `${c.months_since_entry}m` : '—'}</td>
        <td>${escapeHtml(c.programa ?? '—')}</td>
        <td>${escapeHtml(c.ep ?? '—')}</td>
        <td class="num">${c.qtd_nps}</td>
        <td class="num">${c.last_score ?? '—'}</td>
        <td>${escapeHtml(c.last_category ?? '—')}</td>
        <td class="num">${c.meetings_last ?? '—'}</td>
        <td>${escapeHtml(mech)}</td>
        <td>${escapeHtml(c.last_cycle ?? '—')}</td>
      </tr>`;
    })
    .join('');
  const footer = `<div class="safras-table-footer"><span>${total ? start + 1 : 0}–${Math.min(start + pageSize, total)} de ${total}</span>
    <div class="safras-pager"><button type="button" class="btn btn--secondary btn--sm" data-cli-prev ${p <= 1 ? 'disabled' : ''}>←</button><span>${p}/${pages}</span><button type="button" class="btn btn--secondary btn--sm" data-cli-next ${p >= pages ? 'disabled' : ''}>→</button></div></div>`;
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Cliente Explorer</h2><p class="safras-section-card__lead">Clique na linha para abrir visão 360 temporal (PIT).</p></div>
    <div class="table-shell table-shell--scroll"><table class="data-table safras-data-table safras-explorer-table"><thead><tr>
      <th>Cliente</th><th>Safra</th><th>Entrada</th><th class="num">Tempo</th><th>Programa</th><th>EP</th><th class="num">Qtd NPS</th>
      <th class="num">Últ. nota</th><th>Cat.</th><th class="num">Reuniões</th><th>Mec.</th><th>Último ciclo</th>
    </tr></thead><tbody>${tbody || '<tr><td colspan="12">Nenhum cliente</td></tr>'}</tbody></table></div>${footer}</div>`;
}

export function renderSafraMatrix(matrix, metric) {
  const { safras, ciclos, cells, safraTotals } = matrix;
  const head = ciclos.map((c) => `<th class="num">${escapeHtml(c)}</th>`).join('');
  const body = safras
    .map((s) => {
      let row = `<tr><th scope="row" class="safras-matrix-sticky-col">${escapeHtml(s)}</th>`;
      for (const c of ciclos) {
        const scores = cells.get(`${s}|${c}`);
        const cell = scores?.length
          ? (() => {
              const prom = scores.filter((x) => x >= 9).length;
              const det = scores.filter((x) => x <= 6).length;
              const n = scores.length;
              let display = '—';
              if (metric === 'nps') display = formatNps(((100 * prom - 100 * det) / n));
              else if (metric === 'avg')
                display = (scores.reduce((a, b) => a + b, 0) / n).toFixed(1);
              else if (metric === 'responses') display = String(n);
              else {
                const tot = safraTotals.get(s) ?? 0;
                display = tot ? formatPct((100 * n) / tot) : '—';
              }
              return `<td class="num" title="N=${n}">${display}</td>`;
            })()
          : `<td class="num">—</td>`;
        row += cell;
      }
      return `${row}</tr>`;
    })
    .join('');
  return `<div class="table-shell table-shell--scroll"><table class="data-table safras-data-table safras-matrix-table"><thead><tr>
    <th class="safras-matrix-sticky-col">Safra ↓ / Ciclo →</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
