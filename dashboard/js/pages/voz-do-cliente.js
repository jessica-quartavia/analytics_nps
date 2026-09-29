import {
  hasVocArtifacts,
  getTopicSummary,
  getResponseTopics,
  getVocClassificationMeta,
  getVocPageKpis,
  getVocCommentTableRows,
  getCycleSummary,
  getCycles,
  getResponses,
  getDataState,
} from '../data/analytics-store.js';
import { getFilters, setFilter, setFilters } from '../filters/global-filters.js';
import { formatNps, formatPct, formatDate, cycleStatusLabel } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';

let valenceChart = null;
let tableState = { page: 1, pageSize: 25 };

function destroyCharts() {
  valenceChart?.destroy();
  valenceChart = null;
}

function commentCountWithoutTopics(cycleCode) {
  const responses = getResponses(cycleCode);
  return responses.filter((r) => String(r.comment ?? '').trim()).length;
}

function renderEmptyState(cycleCode) {
  const total = commentCountWithoutTopics(cycleCode);
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Voz do cliente</p>
        <h1 class="hero__title">O que os clientes estão dizendo</h1>
        <p class="page-header__lead">Temas, valência e evolução dos comentários ao longo dos ciclos.</p>
      </div>
    </header>
    <div class="quality-box">
      <strong>Classificação temática ainda não disponível.</strong>
      <p>Os comentários estão preservados, mas ainda não foram classificados em tema e valência.</p>
      ${total ? `<p class="note-muted">${total} comentário(s) no ciclo selecionado · cobertura 0%</p>` : ''}
    </div>`;
}

function renderHero(cycle, summary) {
  const dataState = getDataState();
  const cutoff = formatDate(summary?.data_cutoff ?? dataState?.dataCutoff);
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Voz do cliente</p>
        <h1 class="hero__title">O que os clientes estão dizindo</h1>
        <p class="page-header__lead">Temas, valência e evolução dos comentários ao longo dos ciclos.</p>
      </div>
      <div class="chip-row">
        <span class="chip-modern">${escapeHtml(cycle?.cycle_name ?? '—')}</span>
        <span class="chip-modern">${escapeHtml(cycleStatusLabel(summary?.status))}</span>
        <span class="chip-modern">Atualizado ${escapeHtml(cutoff)}</span>
      </div>
    </header>`;
}

function renderKpis(kpis, meta) {
  const cov = meta?.pct_coverage;
  return `
    <div class="metric-compact-grid">
      <article class="metric-compact"><div class="metric-compact__label">Comentários analisados</div><div class="metric-compact__value">${kpis.commentsAnalyzed}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Comentários com tema</div><div class="metric-compact__value">${kpis.commentsWithTopic}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">Temas distintos</div><div class="metric-compact__value">${kpis.distinctTopics}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">% comentários negativos</div><div class="metric-compact__value">${escapeHtml(formatPct(kpis.pctNegativeComments, 1))}</div></article>
      <article class="metric-compact"><div class="metric-compact__label">% multitema</div><div class="metric-compact__value">${escapeHtml(formatPct(kpis.pctMultitopic, 1))}</div></article>
      ${cov != null ? `<article class="metric-compact"><div class="metric-compact__label">Cobertura global</div><div class="metric-compact__value">${escapeHtml(formatPct(cov, 1))}</div></article>` : ''}
    </div>`;
}

function sortTopicsForView(entries, sortMode) {
  const rows = entries.filter((e) => e.responses_with_topic > 0);
  if (sortMode === 'negative') {
    return [...rows].sort((a, b) => (b.negative_pct ?? 0) - (a.negative_pct ?? 0));
  }
  if (sortMode === 'positive') {
    return [...rows].sort((a, b) => (b.positive_pct ?? 0) - (a.positive_pct ?? 0));
  }
  return [...rows].sort((a, b) => (b.responses_with_topic ?? 0) - (a.responses_with_topic ?? 0));
}

function renderTopicRanking(entries, sortMode) {
  const sorted = sortTopicsForView(entries, sortMode);
  if (!sorted.length) return '<p class="note-muted">Nenhum tema classificado neste ciclo.</p>';
  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th scope="col">Tema</th><th class="num" scope="col">Respostas</th><th class="num" scope="col">% respostas</th><th class="num" scope="col">NPS associado</th><th class="num" scope="col">Nota média</th></tr></thead>
        <tbody>
          ${sorted
            .map(
              (t) => `
            <tr data-voc-topic="${escapeAttr(t.topic)}" title="Menções: ${t.mentions} · Respostas únicas: ${t.responses_with_topic}">
              <td>${escapeHtml(t.topic)}</td>
              <td class="num">${t.responses_with_topic}</td>
              <td class="num">${escapeHtml(formatPct(t.pct_responses, 1))}</td>
              <td class="num">${t.nps != null ? escapeHtml(formatNps(t.nps)) : '—'}</td>
              <td class="num">${t.average_score != null ? t.average_score.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <p class="note-muted">NPS e nota média associados a quem mencionou o tema — não implicam causalidade.</p>`;
}

function renderMatrix(entries) {
  const active = entries.filter((e) => e.mentions > 0);
  if (!active.length) return '';
  const valences = ['Positiva', 'Neutra', 'Negativa'];
  return `
    <div class="table-scroll">
      <table class="data-table voc-matrix" id="voc-matrix">
        <thead><tr><th scope="col">Tema</th>${valences.map((v) => `<th class="num" scope="col">${escapeHtml(v)}</th>`).join('')}</tr></thead>
        <tbody>
          ${active
            .map((t) => {
              const cells = {
                Positiva: t.positive,
                Neutra: t.neutral,
                Negativa: t.negative,
              };
              return `<tr>
                <td>${escapeHtml(t.topic)}</td>
                ${valences
                  .map((v) => {
                    const n = cells[v] ?? 0;
                    const pct = t.mentions ? (n / t.mentions) * 100 : 0;
                    return `<td class="num voc-matrix__cell" data-topic="${escapeAttr(t.topic)}" data-valence="${escapeAttr(v)}" tabindex="0" role="button">${n}<span class="note-muted"> (${formatPct(pct, 0)})</span></td>`;
                  })
                  .join('')}
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function evolutionGroup(title, items) {
  if (!items.length) return '';
  return `
    <article class="card-modern">
      <h3 class="card-modern__title">${escapeHtml(title)}</h3>
      <ul class="voc-evolution-list">
        ${items
          .map(
            (t) => `
          <li>
            <strong>${escapeHtml(t.topic)}</strong>
            <span class="note-muted">${t.previous_pct_responses != null ? formatPct(t.previous_pct_responses, 1) : '—'} → ${formatPct(t.pct_responses, 1)} (${t.mention_pct_delta != null ? (t.mention_pct_delta >= 0 ? '+' : '') + t.mention_pct_delta.toFixed(1) + ' pp' : '—'})</span>
          </li>`,
          )
          .join('')}
      </ul>
    </article>`;
}

function renderEvolution(entries) {
  const groups = {
    pain_emerging: [],
    recurring_pain: [],
    improving: [],
    positive_emerging: [],
  };
  for (const t of entries) {
    if (t.evolution_signal && groups[t.evolution_signal]) groups[t.evolution_signal].push(t);
  }
  const any = Object.values(groups).some((g) => g.length);
  if (!any) return '<p class="note-muted">Sem sinais de evolução relevantes vs ciclo anterior (limiares analíticos).</p>';
  return `
    <div class="voc-evolution-grid">
      ${evolutionGroup('Dores emergentes', groups.pain_emerging)}
      ${evolutionGroup('Dores recorrentes', groups.recurring_pain)}
      ${evolutionGroup('Em melhora', groups.improving)}
      ${evolutionGroup('Positivos emergentes', groups.positive_emerging)}
    </div>`;
}

function renderQuality(meta) {
  if (!meta) return '';
  return `
    <div class="quality-box">
      <strong>Qualidade da classificação</strong>
      <ul>
        <li>Cobertura: ${formatPct(meta.pct_coverage ?? 0, 1)} (${meta.comments_with_topic ?? 0}/${meta.comments_total ?? 0} comentários)</li>
        <li>Revisados: ${formatPct(meta.pct_reviewed ?? 0, 1)}</li>
        <li>Confiança média: ${meta.confidence_mean != null ? meta.confidence_mean.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}</li>
        <li>Faixas: alta ${meta.confidence_buckets?.high ?? 0} · média ${meta.confidence_buckets?.medium ?? 0} · baixa ${meta.confidence_buckets?.low ?? 0}</li>
        <li>Fontes: ${escapeHtml(JSON.stringify(meta.sources ?? {}))}</li>
      </ul>
      <p class="note-muted">Classificação rules_v1 é parcial e auditável; comentários sem match permanecem sem tema.</p>
    </div>`;
}

function paginateRows(rows, page, pageSize) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * pageSize;
  return { slice: rows.slice(start, start + pageSize), page: p, pages, total };
}

function renderCommentsTable(rows, page, pageSize) {
  const { slice, page: p, pages, total } = paginateRows(rows, page, pageSize);
  return `
    <div class="table-scroll" id="voc-comments-host">
      <table class="data-table" id="voc-comments-table">
        <thead>
          <tr>
            <th scope="col">Cliente</th><th scope="col">EP</th><th class="num" scope="col">Nota</th><th scope="col">Categoria</th>
            <th scope="col">Tema</th><th scope="col">Valência</th><th scope="col">Comentário</th><th scope="col">Ciclo</th>
          </tr>
        </thead>
        <tbody>
          ${slice
            .map(
              (r) => `
            <tr data-response-id="${escapeAttr(r.response_id)}" class="voc-comment-row">
              <td>${escapeHtml(r.client_name ?? '—')}</td>
              <td>${escapeHtml(r.ep_name ?? '—')}</td>
              <td class="num">${escapeHtml(String(r.score ?? '—'))}</td>
              <td>${escapeHtml(r.nps_category ?? '—')}</td>
              <td>${escapeHtml(r.topic)}</td>
              <td>${escapeHtml(r.valence)}</td>
              <td class="voc-comment-snippet">${escapeHtml((r.comment ?? '').slice(0, 120))}${(r.comment?.length ?? 0) > 120 ? '…' : ''}</td>
              <td>${escapeHtml(r.cycle_name ?? '—')}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="table-pagination">
      <label>Por página
        <select id="voc-page-size" class="select-input">
          ${[25, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <span>${total} linha(s) · página ${p}/${pages}</span>
      <button type="button" class="btn-ghost" id="voc-prev" ${p <= 1 ? 'disabled' : ''}>Anterior</button>
      <button type="button" class="btn-ghost" id="voc-next" ${p >= pages ? 'disabled' : ''}>Próxima</button>
    </div>`;
}

function mountValenceChart(canvas, entries, sortMode) {
  if (!canvas || !window.Chart) return;
  const sorted = sortTopicsForView(entries, sortMode).slice(0, 10);
  const labels = sorted.map((t) => t.topic);
  destroyCharts();
  const rootStyle = getComputedStyle(document.documentElement);
  valenceChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Positiva',
          data: sorted.map((t) => t.positive),
          backgroundColor: rootStyle.getPropertyValue('--color-promoter').trim() || '#16a34a',
          stack: 'v',
        },
        {
          label: 'Neutra',
          data: sorted.map((t) => t.neutral),
          backgroundColor: rootStyle.getPropertyValue('--color-passive').trim() || '#ca8a04',
          stack: 'v',
        },
        {
          label: 'Negativa',
          data: sorted.map((t) => t.negative),
          backgroundColor: rootStyle.getPropertyValue('--color-detractor').trim() || '#dc2626',
          stack: 'v',
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true, max: Math.max(...sorted.map((t) => t.mentions), 1) } },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

export function closeVocDrawer() {
  document.getElementById('voc-drawer-backdrop')?.classList.remove('is-open');
  document.getElementById('voc-drawer')?.classList.remove('is-open');
}

function openVocDrawer(responseId, cycleCode) {
  const responses = getResponses(cycleCode);
  const r = responses.find((x) => x.response_id === responseId);
  if (!r) return;
  const topics = getResponseTopics(cycleCode).filter((t) => t.response_id === responseId);
  const backdrop = document.getElementById('voc-drawer-backdrop');
  const drawer = document.getElementById('voc-drawer');
  if (!drawer) return;

  drawer.innerHTML = `
    <button type="button" class="drawer__close" id="voc-drawer-close" aria-label="Fechar">×</button>
    <h2>${escapeHtml(r.client_name ?? 'Cliente')}</h2>
    <p>EP: ${escapeHtml(r.ep_name ?? '—')}</p>
    <p>Ciclo: ${escapeHtml(r.analytical_cycle_name ?? '—')}</p>
    <p>Nota: ${escapeHtml(String(r.score ?? '—'))} · ${escapeHtml(r.nps_category ?? '—')}</p>
    <p class="drawer-comment">${escapeHtml(r.comment ?? '')}</p>
    <h3>Temas</h3>
    <ul>${topics.map((t) => `<li>${escapeHtml(t.topic)} — ${escapeHtml(t.valence)} <span class="note-muted">conf. ${t.confidence ?? '—'} · ${escapeHtml(t.classification_source ?? '')}${t.reviewed ? ' · revisado' : ''}</span></li>`).join('')}</ul>
  `;

  backdrop?.classList.add('is-open');
  drawer.classList.add('is-open');
  drawer.querySelector('#voc-drawer-close')?.addEventListener('click', closeVocDrawer);
  backdrop?.addEventListener('click', closeVocDrawer, { once: true });
}

function bindInteractions(host, cycleCode, entries, filters, signal) {
  host.querySelector('#voc-sort')?.addEventListener(
    'change',
    (e) => {
      setFilter('vocSort', e.target.value);
    },
    { signal },
  );

  host.querySelectorAll('.voc-matrix__cell').forEach((cell) => {
    cell.addEventListener(
      'click',
      () => {
        setFilters({
          topic: cell.dataset.topic ?? '',
          valence: cell.dataset.valence ?? '',
          vocMatrixTopic: cell.dataset.topic ?? '',
          vocMatrixValence: cell.dataset.valence ?? '',
        });
      },
      { signal },
    );
  });

  host.querySelectorAll('.voc-comment-row').forEach((row) => {
    row.addEventListener(
      'click',
      () => openVocDrawer(row.dataset.responseId, cycleCode),
      { signal },
    );
  });

  host.querySelector('#voc-prev')?.addEventListener('click', () => {
    tableState.page = Math.max(1, tableState.page - 1);
    renderVozDoCliente(host, { signal });
  }, { signal });

  host.querySelector('#voc-next')?.addEventListener('click', () => {
    tableState.page += 1;
    renderVozDoCliente(host, { signal });
  }, { signal });

  host.querySelector('#voc-page-size')?.addEventListener('change', (e) => {
    tableState.pageSize = Number(e.target.value) || 25;
    tableState.page = 1;
    renderVozDoCliente(host, { signal });
  }, { signal });

  const canvas = host.querySelector('#chart-voc-valence');
  if (canvas && entries.length) mountValenceChart(canvas, entries, filters.vocSort || 'volume');
}

export function renderVozDoCliente(host, { signal } = {}) {
  destroyCharts();
  const filters = getFilters();
  const cycleCode = filters.cycleCode;
  const cycles = getCycles();
  const cycle = cycles.find((c) => c.cycle_code === cycleCode);
  const summary = getCycleSummary(cycleCode);

  if (!hasVocArtifacts()) {
    host.innerHTML = renderEmptyState(cycleCode);
    return;
  }

  const entries = getTopicSummary(cycleCode);
  const meta = getVocClassificationMeta();
  const kpis = getVocPageKpis(cycleCode);
  const tableFilters = {
    topic: filters.topic,
    valence: filters.valence,
    ep: filters.ep,
    category: filters.category,
    search: filters.search,
  };
  const commentRows = getVocCommentTableRows(cycleCode, tableFilters);
  const sortMode = filters.vocSort || 'volume';

  host.innerHTML = `
    ${renderHero(cycle, summary)}
    ${renderKpis(kpis, meta)}
    <section class="section-block">
      <div class="section-block__head">
        <h2 class="section-title">Ranking de temas</h2>
        <select id="voc-sort" class="select-input" aria-label="Ordenação de temas">
          <option value="volume" ${sortMode === 'volume' ? 'selected' : ''}>Maior volume</option>
          <option value="negative" ${sortMode === 'negative' ? 'selected' : ''}>Maior negativo</option>
          <option value="positive" ${sortMode === 'positive' ? 'selected' : ''}>Maior positivo</option>
        </select>
      </div>
      ${renderTopicRanking(entries, sortMode)}
    </section>
    <section class="section-block">
      <h2 class="section-title">Valência por tema</h2>
      <div class="chart-box chart-box--tall"><canvas id="chart-voc-valence" aria-label="Barras empilhadas de valência"></canvas></div>
    </section>
    <section class="section-block">
      <h2 class="section-title">Matriz tema × valência</h2>
      ${renderMatrix(entries)}
    </section>
    <section class="section-block">
      <h2 class="section-title">Como os temas mudaram</h2>
      ${renderEvolution(entries)}
    </section>
    <section class="section-block">
      <h2 class="section-title">Comentários classificados</h2>
      ${renderCommentsTable(commentRows, tableState.page, tableState.pageSize)}
    </section>
    ${renderQuality(meta)}
  `;

  bindInteractions(host, cycleCode, entries, filters, signal);
}
