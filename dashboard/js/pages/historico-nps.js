import {
  getHistoricalNpsSummary,
  getHistoricalNpsResponses,
  getHistoricalNpsClients,
  getHistoricalNpsFieldCoverage,
  getCustomerNpsCohorts,
  getCustomerNpsHistory,
} from '../data/analytics-store.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatNps, formatPct, formatDate } from '../utils/format.js';
import { cycleSortKey } from '../utils/cycle-sort.mjs';
import {
  defaultHistoricoFilters,
  filterResponses,
  buildMovementCounts,
  scoreTrendBuckets,
  secondaryScoresByCycle,
  commentStatsByCycle,
  clientRecurrenceMap,
  epOptionsFromResponses,
  safraOptionsFromResponses,
  cycleOptions,
  npsFromScores,
} from '../data/historico-nps-view.mjs';
import { openCohortClientDrawer, closeCohortClientDrawer } from '../ui/cohort-client-drawer.mjs';
import {
  openHistoricoResponseDrawer,
  closeHistoricoResponseDrawer,
} from '../ui/historico-response-drawer.mjs';

let pageFilters = defaultHistoricoFilters();
let chartInstances = [];
let respPage = 1;
let clientPage = 1;
let moveFrom = '2026-Q2';
let moveTo = '2026-Q3';
const PAGE_SIZE = 25;

function destroyCharts() {
  for (const c of chartInstances) c.destroy();
  chartInstances = [];
}

function badgeCategory(cat) {
  const c = (cat ?? '').toLowerCase();
  let cls = 'badge--neutral-soft';
  if (c.includes('promot')) cls = 'badge--promoter';
  else if (c.includes('detrat')) cls = 'badge--detractor';
  else if (c.includes('neutr')) cls = 'badge--passive';
  return `<span class="badge ${cls}">${escapeHtml(cat ?? '—')}</span>`;
}

function renderKpis(meta, summary, filtered, clientsAgg) {
  const cycles = summary?.cycles ?? [];
  const official = cycles.filter((c) => c.is_official);
  const lastOff = official[official.length - 1];
  const prevOff = official[official.length - 2];
  const scores = filtered.map((r) => r.nota_nps).filter((s) => s != null);
  const npsFiltrado = npsFromScores(scores);
  const rec = meta?.recurrence ?? {};
  return `<div class="safras-kpi-grid">
    <div class="safras-kpi"><span class="safras-kpi__label">NPS oficial (última medição)</span><strong class="safras-kpi__value">${lastOff?.nps_oficial != null ? formatNps(lastOff.nps_oficial) : '—'}</strong><span class="note-muted">${escapeHtml(lastOff?.ciclo ?? '')}</span></div>
    <div class="safras-kpi"><span class="safras-kpi__label">NPS oficial (anterior)</span><strong class="safras-kpi__value">${prevOff?.nps_oficial != null ? formatNps(prevOff.nps_oficial) : '—'}</strong><span class="note-muted">${escapeHtml(prevOff?.ciclo ?? '')}</span></div>
    <div class="safras-kpi"><span class="safras-kpi__label">Variação oficial</span><strong class="safras-kpi__value">${lastOff && prevOff && lastOff.nps_oficial != null && prevOff.nps_oficial != null ? formatNps(lastOff.nps_oficial - prevOff.nps_oficial) : '—'}</strong></div>
    <div class="safras-kpi"><span class="safras-kpi__label">NPS do recorte filtrado</span><strong class="safras-kpi__value">${npsFiltrado != null ? formatNps(npsFiltrado) : '—'}</strong><span class="note-muted">n=${scores.length}</span></div>
    <div class="safras-kpi"><span class="safras-kpi__label">Respostas (dedupe)</span><strong class="safras-kpi__value">${meta?.after_dedupe ?? '—'}</strong><span class="note-muted">${meta?.historico_input ?? 0} hist. + ${meta?.current_input ?? 0} atual</span></div>
    <div class="safras-kpi"><span class="safras-kpi__label">Clientes únicos</span><strong class="safras-kpi__value">${meta?.unique_clients ?? '—'}</strong></div>
    <div class="safras-kpi"><span class="safras-kpi__label">Recorrentes (2+)</span><strong class="safras-kpi__value">${(rec.twice ?? 0) + (rec.three_plus ?? 0)}</strong></div>
    <div class="safras-kpi"><span class="safras-kpi__label">Medições</span><strong class="safras-kpi__value">${cycles.length}</strong></div>
    <div class="safras-kpi"><span class="safras-kpi__label">1 resposta</span><strong class="safras-kpi__value">${rec.once ?? '—'}</strong></div>
    <div class="safras-kpi"><span class="safras-kpi__label">Clientes no recorte</span><strong class="safras-kpi__value">${clientsAgg.length}</strong></div>
  </div>`;
}

function renderFilters(allResponses, summary, formVersions) {
  const ciclos = cycleOptions(summary);
  const eps = epOptionsFromResponses(allResponses);
  const safras = safraOptionsFromResponses(allResponses);
  const versoes = (formVersions ?? []).map((v) => v.versao);
  const opt = (val, cur, label) =>
    `<option value="${escapeAttr(val)}" ${cur === val ? 'selected' : ''}>${escapeHtml(label ?? (val || 'Todos'))}</option>`;
  return `<div class="safras-filters-card" data-hist-filters>
    <div class="safras-filters-grid">
      <div class="filter-field"><label>Ciclo</label><select data-f="ciclo">${opt('', pageFilters.ciclo, 'Todos')}${ciclos.map((c) => opt(c, pageFilters.ciclo, c)).join('')}</select></div>
      <div class="filter-field"><label>EP</label><select data-f="ep">${opt('', pageFilters.ep, 'Todos')}${eps.map((e) => opt(e, pageFilters.ep, e)).join('')}</select></div>
      <div class="filter-field"><label>Safra</label><select data-f="safra">${opt('', pageFilters.safra, 'Todos')}${safras.map((s) => opt(s, pageFilters.safra, s)).join('')}</select></div>
      <div class="filter-field"><label>Categoria</label><select data-f="categoria">
        ${opt('', pageFilters.categoria, 'Todas')}
        ${['Promotor', 'Neutro', 'Detrator'].map((c) => opt(c, pageFilters.categoria, c)).join('')}
      </select></div>
      <div class="filter-field"><label>Versão formulário</label><select data-f="versao">${opt('', pageFilters.versao, 'Todas')}${versoes.map((v) => opt(v, pageFilters.versao, v)).join('')}</select></div>
      <div class="filter-field"><label>Recorrência</label><select data-f="recorrencia">
        ${opt('', pageFilters.recorrencia, 'Todos')}
        ${opt('1', pageFilters.recorrencia, '1 resposta')}
        ${opt('2', pageFilters.recorrencia, '2 respostas')}
        ${opt('3+', pageFilters.recorrencia, '3+ respostas')}
      </select></div>
      <div class="filter-field"><label>Busca cliente</label><input type="search" class="text-input" data-f="search" value="${escapeAttr(pageFilters.search)}" placeholder="Nome…" /></div>
    </div>
    <div class="safras-page__actions">
      <button type="button" class="btn btn--secondary btn--sm" data-hist-clear-filters>Limpar filtros</button>
    </div>
  </div>`;
}

function renderSummaryTable(cycles) {
  const rows = (cycles ?? [])
    .slice()
    .sort((a, b) => cycleSortKey(a.ciclo) - cycleSortKey(b.ciclo))
    .map(
      (c) => `<tr>
      <td>${escapeHtml(c.ciclo)}</td>
      <td>${escapeHtml(c.periodo ?? '—')}</td>
      <td class="num">${c.respostas ?? c.respostas_derivadas ?? '—'}${c.is_official ? ' <span class="note-muted" title="Oficial">●</span>' : ''}</td>
      <td class="num">${c.clientes_unicos ?? '—'}</td>
      <td class="num">${c.promotores ?? '—'}</td>
      <td class="num">${c.neutros ?? '—'}</td>
      <td class="num">${c.detratores ?? '—'}</td>
      <td class="num">${c.pct_promotores != null ? formatPct(c.pct_promotores) : '—'}</td>
      <td class="num">${c.pct_neutros != null ? formatPct(c.pct_neutros) : '—'}</td>
      <td class="num">${c.pct_detratores != null ? formatPct(c.pct_detratores) : '—'}</td>
      <td class="num">${c.nps_oficial != null ? formatNps(c.nps_oficial) : '—'}</td>
      <td class="num">${c.nota_media ?? '—'}</td>
      <td class="num">${c.variacao_vs_anterior != null ? formatNps(c.variacao_vs_anterior) : '—'}</td>
    </tr>`,
    )
    .join('');
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Histórico de medições</h2><p class="safras-section-card__lead">NPS oficial (●) de nps_historico.medicoes quando disponível; demais métricas derivadas do recorte.</p></div>
    <div class="table-shell"><table class="data-table safras-data-table"><thead><tr>
      <th>Ciclo</th><th>Período</th><th class="num">Respostas</th><th class="num">Clientes únicos</th>
      <th class="num">Prom.</th><th class="num">Neut.</th><th class="num">Det.</th>
      <th class="num">% Prom.</th><th class="num">% Neut.</th><th class="num">% Det.</th>
      <th class="num">NPS oficial</th><th class="num">Nota média</th><th class="num">Δ anterior</th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderMovement(cycles, filtered) {
  const opts = (cycles ?? []).map((c) => `<option value="${escapeAttr(c.ciclo)}" ${c.ciclo === moveFrom ? 'selected' : ''}>${escapeHtml(c.ciclo)}</option>`).join('');
  const optsTo = (cycles ?? []).map((c) => `<option value="${escapeAttr(c.ciclo)}" ${c.ciclo === moveTo ? 'selected' : ''}>${escapeHtml(c.ciclo)}</option>`).join('');
  const counts = buildMovementCounts(filtered, moveFrom, moveTo);
  const items = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `<li>${escapeHtml(k)}: <strong>${n}</strong></li>`)
    .join('');
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Movimento entre ciclos</h2></div>
    <div class="safras-filters-grid" style="margin-bottom:1rem">
      <div class="filter-field"><label>Ciclo origem</label><select data-move-from>${opts}</select></div>
      <div class="filter-field"><label>Ciclo destino</label><select data-move-to>${optsTo}</select></div>
    </div>
    <ul class="timeline-list">${items || '<li>Sem pares no recorte</li>'}</ul></div>`;
}

function renderRecurrence(meta) {
  const r = meta?.recurrence ?? {};
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Recorrência de participação</h2></div>
    <div class="safras-kpi-grid safras-kpi-grid--compact">
      <div class="safras-kpi"><span class="safras-kpi__label">1 vez</span><strong>${r.once ?? 0}</strong></div>
      <div class="safras-kpi"><span class="safras-kpi__label">2 vezes</span><strong>${r.twice ?? 0}</strong></div>
      <div class="safras-kpi"><span class="safras-kpi__label">3+</span><strong>${r.three_plus ?? 0}</strong></div>
    </div>
    <canvas id="chart-hist-recurrence" height="180"></canvas></div>`;
}

function renderScoreTrend(clientsFiltered) {
  const t = scoreTrendBuckets(clientsFiltered);
  const pct = (n) => (t.n ? Math.round((1000 * n) / t.n) / 10 : 0);
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Evolução de nota (clientes 2+ medições)</h2></div>
    <p>Melhoraram: <strong>${t.up}</strong> (${pct(t.up)}%) · Estáveis: <strong>${t.flat}</strong> · Pioraram: <strong>${t.down}</strong> · Δ médio: <strong>${t.avgDelta ?? '—'}</strong></p></div>`;
}

function renderSecondaryTable(rows) {
  const body = rows
    .map(
      (r) => `<tr><td>${escapeHtml(r.ciclo)}</td><td class="num">${r.n}</td>
      <td class="num">${r.Estrategista ?? '—'} <span class="note-muted">(n=${r.Estrategista_n ?? 0})</span></td>
      <td class="num">${r.Backoffice ?? '—'} <span class="note-muted">(n=${r.Backoffice_n ?? 0})</span></td>
      <td class="num">${r.QV360 ?? '—'} <span class="note-muted">(n=${r.QV360_n ?? 0})</span></td>
      <td class="num">${r.Arquitetura ?? '—'} <span class="note-muted">(n=${r.Arquitetura_n ?? 0})</span></td></tr>`,
    )
    .join('');
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Indicadores complementares</h2><p class="safras-section-card__lead">Médias apenas onde o campo existe; ausência não é zero.</p></div>
    <div class="table-shell"><table class="data-table safras-data-table"><thead><tr><th>Ciclo</th><th class="num">N</th><th class="num">Estrategista</th><th class="num">Backoffice</th><th class="num">QV360</th><th class="num">Arquitetura</th></tr></thead><tbody>${body || '<tr><td colspan="6">Sem dados</td></tr>'}</tbody></table></div></div>`;
}

function renderFieldMatrix(coverage) {
  if (!coverage?.fields?.length) return '';
  const cycles = coverage.cycles ?? [];
  const head = cycles.map((c) => `<th class="num">${escapeHtml(c)}</th>`).join('');
  const body = coverage.fields
    .map((field) => {
      const cells = cycles
        .map((c) => {
          const n = coverage.matrix?.[field]?.[c];
          return `<td class="num">${n ? '✓' : '—'}</td>`;
        })
        .join('');
      return `<tr><td>${escapeHtml(field)}</td>${cells}</tr>`;
    })
    .join('');
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Disponibilidade de campos</h2></div>
    <div class="table-shell table-shell--scroll"><table class="data-table safras-data-table"><thead><tr><th>Campo</th>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function renderFormVersions(versions) {
  const rows = (versions ?? [])
    .map(
      (v) => `<tr><td>${escapeHtml(v.versao)}</td><td>${escapeHtml((v.ciclos ?? []).join(', '))}</td><td class="num">${v.n}</td></tr>`,
    )
    .join('');
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Versões de formulário</h2></div>
    <div class="table-shell"><table class="data-table safras-data-table"><thead><tr><th>Versão</th><th>Ciclos</th><th class="num">Respostas</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderVocSection(stats) {
  const rows = stats
    .map(
      (s) => `<tr><td>${escapeHtml(s.ciclo)}</td><td class="num">${s.respostas}</td><td class="num">${s.com_comentario}</td><td class="num">${formatPct(s.pct)}</td></tr>`,
    )
    .join('');
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Voz do Cliente ao longo do tempo</h2><p class="safras-section-card__lead">Volume de comentários; classificação Gemini quando disponível em VoC.</p></div>
    <div class="table-shell"><table class="data-table safras-data-table"><thead><tr><th>Ciclo</th><th class="num">Respostas</th><th class="num">Com comentário</th><th class="num">%</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderQuality(meta) {
  return `<div class="safras-section-card safras-quality-card"><details open><summary>Qualidade & cobertura</summary>
    <div class="safras-quality-grid">
      <div class="safras-quality-item"><strong>Histórico (input)</strong><br>${meta?.historico_input ?? '—'}</div>
      <div class="safras-quality-item"><strong>Atual (input)</strong><br>${meta?.current_input ?? '—'}</div>
      <div class="safras-quality-item"><strong>Após dedupe</strong><br>${meta?.after_dedupe ?? '—'}</div>
      <div class="safras-quality-item"><strong>Clientes únicos</strong><br>${meta?.unique_clients ?? '—'}</div>
      <div class="safras-quality-item"><strong>Histórico sem client_id</strong><br>${meta?.unmatched_historico ?? '—'}</div>
    </div></details></div>`;
}

function paginate(rows, page) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages);
  const start = (p - 1) * PAGE_SIZE;
  return { slice: rows.slice(start, start + PAGE_SIZE), total, pages, page: p, start };
}

function renderResponseExplorer(filtered) {
  const { slice, total, pages, page, start } = paginate(filtered, respPage);
  const tbody = slice
    .map((r) => {
      const hf = r.historico_fields ?? {};
      const name = r.client_name ?? '—';
      return `<tr class="safras-explorer-table__row--clickable" data-response-key="${escapeAttr(r.response_key)}" tabindex="0" role="button" aria-label="Ver resposta de ${escapeAttr(name)}">
        <td>${escapeHtml(name)}</td><td>${escapeHtml(r.ciclo ?? '—')}</td><td class="col-date">${r.data_resposta ? formatDate(r.data_resposta) : '—'}</td>
        <td>${escapeHtml(r.safra_trimestre ?? '—')}</td><td>${escapeHtml(r.ep ?? '—')}</td>
        <td class="num">${r.nota_nps ?? '—'}</td><td>${badgeCategory(r.categoria)}</td>
        <td class="num">${hf.nota_estrategista ?? '—'}</td><td>${escapeHtml(String(hf.retencao_5_anos ?? '—'))}</td>
        <td>${escapeHtml(String(hf.plano_patrimonial ?? '—'))}</td><td>${escapeHtml(r.versao_formulario ?? '—')}</td>
        <td>${r.has_comment ? 'Sim' : '—'}</td></tr>`;
    })
    .join('');
  const footer = `<div class="safras-table-footer"><span>${total ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, total)} de ${total}</span>
    <div class="safras-pager"><button type="button" class="btn btn--secondary btn--sm" data-resp-prev ${page <= 1 ? 'disabled' : ''}>←</button><span>${page}/${pages}</span><button type="button" class="btn btn--secondary btn--sm" data-resp-next ${page >= pages ? 'disabled' : ''}>→</button></div></div>`;
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Explorer de respostas</h2></div>
    <div class="table-shell table-shell--scroll"><table class="data-table safras-data-table safras-explorer-table"><thead><tr>
      <th>Cliente</th><th>Ciclo</th><th>Data</th><th>Safra</th><th>EP</th><th class="num">Nota</th><th>Categoria</th>
      <th class="num">Estrategista</th><th>Retenção</th><th>Plano</th><th>Versão</th><th>Comentário?</th>
    </tr></thead><tbody>${tbody || '<tr><td colspan="12">Nenhuma resposta</td></tr>'}</tbody></table></div>${footer}</div>`;
}

function renderClientExplorer(clientsFiltered) {
  const { slice, total, pages, page, start } = paginate(clientsFiltered, clientPage);
  const tbody = slice
    .map((c) => {
      const name = c.client_name ?? '—';
      return `<tr class="safras-explorer-table__row--clickable" data-client-id="${escapeAttr(c.client_id)}" tabindex="0" role="button" aria-label="Ver timeline de ${escapeAttr(name)}">
        <td>${escapeHtml(name)}</td><td class="num">${c.qtd_medicoes}</td>
        <td>${escapeHtml(c.primeira_resposta ?? '—')}</td><td>${escapeHtml(c.ultima_resposta ?? '—')}</td>
        <td class="num">${c.primeira_nota ?? '—'}</td><td class="num">${c.ultima_nota ?? '—'}</td>
        <td class="num">${c.delta ?? '—'}</td><td class="num">${c.media ?? '—'}</td>
        <td class="num">${c.melhor_nota ?? '—'}</td><td class="num">${c.pior_nota ?? '—'}</td>
        <td>${badgeCategory(c.ultima_categoria)}</td></tr>`;
    })
    .join('');
  const footer = `<div class="safras-table-footer"><span>${total ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, total)} de ${total}</span>
    <div class="safras-pager"><button type="button" class="btn btn--secondary btn--sm" data-cli-prev ${page <= 1 ? 'disabled' : ''}>←</button><span>${page}/${pages}</span><button type="button" class="btn btn--secondary btn--sm" data-cli-next ${page >= pages ? 'disabled' : ''}>→</button></div></div>`;
  return `<div class="safras-section-card"><div class="safras-section-card__head"><h2 class="safras-section-card__title">Clientes (agregado)</h2></div>
    <div class="table-shell table-shell--scroll"><table class="data-table safras-data-table safras-explorer-table"><thead><tr>
      <th>Cliente</th><th class="num">Medições</th><th>1ª</th><th>Última</th><th class="num">1ª nota</th><th class="num">Últ. nota</th>
      <th class="num">Δ</th><th class="num">Média</th><th class="num">Melhor</th><th class="num">Pior</th><th>Últ. cat.</th>
    </tr></thead><tbody>${tbody}</tbody></table></div>${footer}</div>`;
}

function bindCharts(summary, meta) {
  const cycles = (summary?.cycles ?? []).slice().sort((a, b) => cycleSortKey(a.ciclo) - cycleSortKey(b.ciclo));
  const labels = cycles.map((c) => c.ciclo);
  const npsLine = cycles.map((c) => (c.nps_oficial != null ? c.nps_oficial : c.nps_derivado));
  const vol = cycles.map((c) => c.respostas ?? c.respostas_derivadas);

  const elNps = document.getElementById('chart-hist-nps');
  if (elNps && typeof Chart !== 'undefined') {
    chartInstances.push(
      new Chart(elNps, {
        type: 'line',
        data: {
          labels,
          datasets: [{ label: 'NPS oficial / derivado', data: npsLine, borderColor: '#c44a2a', tension: 0.25, fill: false }],
        },
        options: {
          plugins: {
            tooltip: {
              callbacks: {
                afterLabel(ctx) {
                  const c = cycles[ctx.dataIndex];
                  if (!c) return '';
                  return `Respostas: ${c.respostas ?? c.respostas_derivadas}\nProm: ${c.promotores} Neut: ${c.neutros} Det: ${c.detratores}\nNota média: ${c.nota_media ?? '—'}`;
                },
              },
            },
          },
        },
      }),
    );
  }

  const elVol = document.getElementById('chart-hist-volume');
  if (elVol && typeof Chart !== 'undefined') {
    chartInstances.push(
      new Chart(elVol, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Respostas', data: vol, backgroundColor: '#e85d3a' }] },
        options: { plugins: { legend: { display: false } } },
      }),
    );
  }

  const elStack = document.getElementById('chart-hist-pnd');
  if (elStack && typeof Chart !== 'undefined') {
    chartInstances.push(
      new Chart(elStack, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Promotores', data: cycles.map((c) => c.pct_promotores), backgroundColor: '#2d8a5f', stack: 's' },
            { label: 'Neutros', data: cycles.map((c) => c.pct_neutros), backgroundColor: '#94a3b8', stack: 's' },
            { label: 'Detratores', data: cycles.map((c) => c.pct_detratores), backgroundColor: '#c44a2a', stack: 's' },
          ],
        },
        options: {
          scales: { x: { stacked: true }, y: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
        },
      }),
    );
  }

  const rec = document.getElementById('chart-hist-recurrence');
  if (rec && typeof Chart !== 'undefined' && meta?.recurrence) {
    const r = meta.recurrence;
    chartInstances.push(
      new Chart(rec, {
        type: 'doughnut',
        data: {
          labels: ['1×', '2×', '3+'],
          datasets: [{ data: [r.once, r.twice, r.three_plus], backgroundColor: ['#e2e8f0', '#e85d3a', '#c44a2a'] }],
        },
      }),
    );
  }
}

function filterClients(clients, filteredResponses) {
  const ids = new Set(filteredResponses.map((r) => r.client_id).filter(Boolean));
  return clients.filter((c) => ids.has(c.client_id));
}

function bindPage(root, ctx) {
  const { allResponses, summary, clientsAll, cohorts, historyAll } = ctx;

  root.querySelector('[data-hist-filters]')?.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.dataset.f) return;
    pageFilters = { ...pageFilters, [t.dataset.f]: t.value };
    respPage = 1;
    clientPage = 1;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-f="search"]')?.addEventListener('input', (ev) => {
    pageFilters = { ...pageFilters, search: ev.target.value };
    respPage = 1;
    clientPage = 1;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-hist-clear-filters]')?.addEventListener('click', () => {
    pageFilters = defaultHistoricoFilters();
    respPage = 1;
    clientPage = 1;
    renderHistoricoNps(root);
  });

  root.querySelector('[data-move-from]')?.addEventListener('change', (ev) => {
    moveFrom = ev.target.value;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-move-to]')?.addEventListener('change', (ev) => {
    moveTo = ev.target.value;
    renderHistoricoNps(root);
  });

  root.querySelector('[data-resp-prev]')?.addEventListener('click', () => {
    if (respPage > 1) {
      respPage -= 1;
      renderHistoricoNps(root);
    }
  });
  root.querySelector('[data-resp-next]')?.addEventListener('click', () => {
    respPage += 1;
    renderHistoricoNps(root);
  });
  root.querySelector('[data-cli-prev]')?.addEventListener('click', () => {
    if (clientPage > 1) {
      clientPage -= 1;
      renderHistoricoNps(root);
    }
  });
  root.querySelector('[data-cli-next]')?.addEventListener('click', () => {
    clientPage += 1;
    renderHistoricoNps(root);
  });

  const openResponse = (key) => openHistoricoResponseDrawer(key, allResponses);
  const openClient = (id) => openCohortClientDrawer(id, cohorts, historyAll, { appUnavailable: true });

  root.querySelectorAll('[data-response-key]').forEach((row) => {
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a, input')) return;
      openResponse(row.dataset.responseKey);
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openResponse(row.dataset.responseKey);
      }
    });
  });

  root.querySelectorAll('[data-client-id]').forEach((row) => {
    if (row.dataset.responseKey) return;
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a, input')) return;
      openClient(row.dataset.clientId);
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openClient(row.dataset.clientId);
      }
    });
  });
}

export function closeHistoricoDrawer() {
  closeCohortClientDrawer();
  closeHistoricoResponseDrawer();
}

export function renderHistoricoNps(root) {
  destroyCharts();
  const summaryDoc = getHistoricalNpsSummary();
  const responsesDoc = getHistoricalNpsResponses();
  const clientsDoc = getHistoricalNpsClients();
  const coverage = getHistoricalNpsFieldCoverage();

  if (!summaryDoc?.meta) {
    root.innerHTML = `<p class="placeholder-note">Execute <code>npm run generate:historico-nps</code> e recarregue.</p>`;
    return;
  }

  const meta = summaryDoc.meta;
  const summary = summaryDoc.summary;
  const allResponses = responsesDoc?.responses ?? [];
  const clientsAll = clientsDoc?.clients ?? [];
  const recMap = clientRecurrenceMap(clientsAll);
  const filtered = filterResponses(allResponses, pageFilters, recMap);
  const clientsFiltered = filterClients(clientsAll, filtered);
  const cohorts = getCustomerNpsCohorts();
  const historyAll = getCustomerNpsHistory();

  if (!moveFrom && summary.cycles?.length) moveFrom = summary.cycles[0].ciclo;
  if (!moveTo && summary.cycles?.length) moveTo = summary.cycles[summary.cycles.length - 1].ciclo;

  root.innerHTML = `<div class="safras-page historico-nps-page">
    <header class="page-header"><div><h1>Histórico NPS</h1><p class="page-lead">Evolução oficial e exploratória — histórico + atual (dedupe: atual vence).</p></div></header>
    ${renderFilters(allResponses, summary, summaryDoc.form_versions)}
    ${renderKpis(meta, summary, filtered, clientsFiltered)}
    <div class="safras-charts-row">
      <div class="chart-card safras-section-card"><h3 class="safras-section-card__title">Evolução NPS</h3><canvas id="chart-hist-nps" height="240"></canvas></div>
      <div class="chart-card safras-section-card"><h3 class="safras-section-card__title">Respostas por medição</h3><canvas id="chart-hist-volume" height="240"></canvas></div>
    </div>
    <div class="safras-section-card"><h3 class="safras-section-card__title">Distribuição P / N / D (%)</h3><canvas id="chart-hist-pnd" height="220"></canvas></div>
    ${renderSummaryTable(summary.cycles)}
    ${renderRecurrence(meta)}
    ${renderMovement(summary.cycles, filtered)}
    ${renderScoreTrend(clientsFiltered)}
    ${renderSecondaryTable(secondaryScoresByCycle(filtered))}
    ${renderVocSection(commentStatsByCycle(filtered))}
    ${renderFormVersions(summaryDoc.form_versions)}
    ${renderFieldMatrix(coverage)}
    ${renderResponseExplorer(filtered)}
    ${renderClientExplorer(clientsFiltered)}
    ${renderQuality(meta)}
  </div>`;

  bindCharts(summary, meta);
  bindPage(root, { allResponses, summary, clientsAll, cohorts, historyAll });
}
