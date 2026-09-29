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
  getTopicFilterOptions,
} from '../data/analytics-store.js';
import { getFilters, setFilter, setFilters, getEpOptions } from '../filters/global-filters.js';
import { formatNps, formatPct, formatDate, cycleStatusLabel } from '../utils/format.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { drawerShell, drawerMetaGrid, drawerTopicChips, drawerQaBlock } from '../ui/drawer-layout.mjs';
import { methodologyOpenButton } from '../ui/methodology-drawer.js';

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
        <p class="page-header__lead">Organiza os comentários por tema e tom para mostrar o que aparece com mais frequência.</p>
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
        <p class="page-header__lead">Organiza os comentários por tema e tom para mostrar o que aparece com mais frequência.</p>
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
        <thead><tr><th scope="col">Tema</th>${valences
          .map((v) => {
            const tip =
              v === 'Neutra'
                ? 'Avalia se o comentário sobre aquele tema foi positivo, neutro ou negativo. É independente da categoria NPS.'
                : '';
            return `<th class="num" scope="col">${escapeHtml(v)}${tip ? ` ${valenceInfoIcon(tip)}` : ''}</th>`;
          })
          .join('')}</tr></thead>
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

const VALENCE_HELP =
  'A valência é atribuída ao trecho do comentário relacionado a cada tema, e não à nota NPS do cliente. Por isso, um Promotor pode mencionar um tema negativamente e um Detrator pode elogiar algum aspecto específico.';

function valenceInfoIcon(title) {
  return `<span class="info-tip" tabindex="0" aria-label="${escapeAttr(title)}" title="${escapeAttr(title)}">ⓘ</span>`;
}

function renderTopicChipsCell(topics, maxVisible = 2) {
  if (!topics?.length) return '<span class="note-muted">—</span>';
  const visible = topics.slice(0, maxVisible);
  const rest = topics.length - visible.length;
  let html = visible
    .map(
      (t) =>
        `<span class="topic-chip topic-chip--inline topic-chip--${escapeAttr(t.valence ?? 'Neutra')}"><span class="topic-chip__name">${escapeHtml(t.topic)}</span><span class="topic-chip__valence">${escapeHtml(t.valence)}</span></span>`,
    )
    .join('');
  if (rest > 0) html += `<span class="note-muted">+${rest} temas</span>`;
  return html;
}

function renderCommentsToolbar(filters, topicOptions) {
  return `
    <div class="voc-comments-toolbar drawer-filters">
      <input class="text-input" id="voc-comments-search" type="search" placeholder="Buscar cliente" value="${escapeAttr(filters.search ?? '')}" aria-label="Buscar cliente" />
      <select class="select-input" id="voc-comments-ep" aria-label="EP"><option value="">Todos EP</option></select>
      <select class="select-input" id="voc-comments-category" aria-label="Categoria">
        <option value="">Todas categorias</option>
        ${['Promotor', 'Neutro', 'Detrator'].map((c) => `<option value="${c}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
      <select class="select-input" id="voc-comments-topic" aria-label="Tema">
        <option value="">Todos temas</option>
        ${topicOptions.map((t) => `<option value="${escapeAttr(t)}" ${filters.topic === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <select class="select-input" id="voc-comments-valence" aria-label="Valência">
        <option value="">Todas valências</option>
        ${['Positiva', 'Neutra', 'Negativa'].map((v) => `<option value="${v}" ${filters.valence === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
      </select>
    </div>`;
}

function renderCommentsTable(rows, page, pageSize, meta = {}) {
  const { slice, page: p, pages, total } = paginateRows(rows, page, pageSize);
  const classCount = rows.reduce((acc, r) => acc + (r.classification_count ?? r.topics?.length ?? 0), 0);
  const countLabel = `${total} clientes · ${classCount} temas classificados`;
  return `
    ${meta.toolbar ?? ''}
    <p class="note-muted voc-comments-count">${escapeHtml(countLabel)}</p>
    <div class="table-scroll" id="voc-comments-host">
      <table class="data-table voc-comments-table" id="voc-comments-table">
        <thead>
          <tr>
            <th scope="col" class="voc-col-client">Cliente</th>
            <th scope="col" class="voc-col-ep">EP</th>
            <th class="num voc-col-score" scope="col">Nota</th>
            <th scope="col" class="voc-col-cat">Categoria</th>
            <th scope="col" class="voc-col-themes">Temas ${valenceInfoIcon(VALENCE_HELP)}</th>
            <th scope="col" class="voc-col-cycle">Ciclo</th>
            <th scope="col" class="voc-col-action">Ação</th>
          </tr>
        </thead>
        <tbody>
          ${slice
            .map(
              (r) => `
            <tr data-response-id="${escapeAttr(r.response_id)}" class="voc-comment-row voc-comment-row--clickable" tabindex="0" role="button" aria-label="Ver resposta de ${escapeAttr(r.client_name ?? 'cliente')}">
              <td class="voc-comment-row__client">${escapeHtml(r.client_name ?? '—')}</td>
              <td>${escapeHtml(r.ep_name ?? '—')}</td>
              <td class="num">${escapeHtml(String(r.score ?? '—'))}</td>
              <td>${escapeHtml(r.nps_category ?? '—')}</td>
              <td class="voc-col-themes">${renderTopicChipsCell(r.topics)}</td>
              <td>${escapeHtml(r.cycle_name ?? '—')}</td>
              <td><button type="button" class="btn btn--ghost btn--sm voc-open-response" data-response-id="${escapeAttr(r.response_id)}" aria-label="Ver resposta">↗</button></td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="voc-comments-cards">
      ${slice
        .map(
          (r) => `<article class="voc-comment-card voc-comment-row--clickable" data-response-id="${escapeAttr(r.response_id)}" tabindex="0" role="button">
          <h4>${escapeHtml(r.client_name ?? '—')}</h4>
          <p class="note-muted">${escapeHtml(r.ep_name ?? '—')} · Nota ${r.score ?? '—'} · ${escapeHtml(r.nps_category ?? '—')}</p>
          <div>${renderTopicChipsCell(r.topics, 4)}</div>
        </article>`,
        )
        .join('')}
    </div>
    <div class="table-pagination">
      <label>Por página
        <select id="voc-page-size" class="select-input">
          ${[25, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <span>Página ${p}/${pages}</span>
      <button type="button" class="btn btn--ghost" id="voc-prev" ${p <= 1 ? 'disabled' : ''}>Anterior</button>
      <button type="button" class="btn btn--ghost" id="voc-next" ${p >= pages ? 'disabled' : ''}>Próxima</button>
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

  const commentBlocks = (r.comment ?? '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      if (lines.length >= 2) {
        return drawerQaBlock(lines[0], lines.slice(1).join('\n'));
      }
      return `<div class="drawer-comment-block"><p class="drawer-qa__a">${escapeHtml(block)}</p></div>`;
    })
    .join('');

  drawer.innerHTML = drawerShell({
    title: r.client_name ?? 'Cliente',
    closeId: 'voc-drawer-close',
    bodyHtml: `
      ${drawerMetaGrid([
        { label: 'EP', value: r.ep_name ?? '—' },
        { label: 'Ciclo', value: r.analytical_cycle_name ?? '—' },
        { label: 'Nota', value: `${r.score ?? '—'} · ${r.nps_category ?? '—'}` },
      ])}
      <div class="drawer-section">
        <h3 class="drawer-section-title">Resposta NPS completa</h3>
        ${commentBlocks || '<p class="note-muted">Sem comentário.</p>'}
      </div>
      <div class="drawer-section">
        <h3 class="drawer-section-title">Temas identificados ${valenceInfoIcon(VALENCE_HELP)} ${methodologyOpenButton('valencia', 'Metodologia')}</h3>
        <p class="note-muted voc-valence-help">${escapeHtml(VALENCE_HELP)}</p>
        <ul class="voc-theme-list">${topics
          .map(
            (t) =>
              `<li><strong>${escapeHtml(t.topic)}</strong> <span class="topic-chip__valence topic-chip__valence--${escapeAttr(t.valence)}">${escapeHtml(t.valence)}</span></li>`,
          )
          .join('')}</ul>
      </div>
      <details class="drawer-section voc-classification-how">
        <summary>Como essa classificação foi feita?</summary>
        <p class="note-muted">Cada tema é detectado por palavras-chave no trecho da resposta; a valência (Positiva, Neutra ou Negativa) vem do texto da cláusula e da pergunta do formulário — não da nota NPS. Fonte: rules_v1 (parcial e auditável).</p>
      </details>`,
  });
  drawer.classList.add('drawer--wide');

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

  const openRow = (responseId) => {
    if (responseId) openVocDrawer(responseId, cycleCode);
  };

  host.querySelectorAll('.voc-open-response').forEach((btn) => {
    btn.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        openRow(btn.dataset.responseId);
      },
      { signal },
    );
  });

  host.querySelectorAll('.voc-comment-row--clickable').forEach((row) => {
    row.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('button, a, input, select, label')) return;
        openRow(row.dataset.responseId);
      },
      { signal },
    );
    row.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openRow(row.dataset.responseId);
        }
      },
      { signal },
    );
  });

  host.querySelector('#voc-comments-search')?.addEventListener(
    'change',
    (e) => {
      setFilter('search', e.target.value);
    },
    { signal },
  );
  host.querySelector('#voc-comments-topic')?.addEventListener(
    'change',
    (e) => setFilter('topic', e.target.value),
    { signal },
  );
  host.querySelector('#voc-comments-valence')?.addEventListener(
    'change',
    (e) => setFilter('valence', e.target.value),
    { signal },
  );
  host.querySelector('#voc-comments-category')?.addEventListener(
    'change',
    (e) => setFilter('category', e.target.value),
    { signal },
  );
  host.querySelector('#voc-comments-ep')?.addEventListener(
    'change',
    (e) => setFilter('ep', e.target.value),
    { signal },
  );

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
  const kpis = getVocPageKpis(cycleCode, filters);
  const tableFilters = {
    topic: filters.topic,
    valence: filters.valence,
    ep: filters.ep,
    category: filters.category,
    search: filters.search,
  };
  const commentRows = getVocCommentTableRows(cycleCode, tableFilters);
  const topicOptions = getTopicFilterOptions(cycleCode);
  const epOptions = getEpOptions(getResponses(cycleCode));
  const toolbar = renderCommentsToolbar(tableFilters, topicOptions).replace(
    '<option value="">Todos EP</option>',
    `<option value="">Todos EP</option>${epOptions.map((ep) => `<option value="${escapeAttr(ep)}" ${filters.ep === ep ? 'selected' : ''}>${escapeHtml(ep)}</option>`).join('')}`,
  );
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
      ${
        filters.topic && filters.valence
          ? `<p class="voc-profile-link"><a class="btn btn--ghost" href="#/jornada-perfil?tema=${encodeURIComponent(filters.topic)}&valencia=${encodeURIComponent(filters.valence)}#jornada-temas">Ver perfil desses clientes →</a></p>`
          : '<p class="note-muted">Selecione uma célula da matriz (ou use os filtros Tema/Valência) para cruzar com perfil e jornada.</p>'
      }
    </section>
    <section class="section-block">
      <h2 class="section-title">Como os temas mudaram</h2>
      ${renderEvolution(entries)}
    </section>
    <section class="section-block">
      <h2 class="section-title">Comentários classificados</h2>
      ${renderCommentsTable(commentRows, tableState.page, tableState.pageSize, { toolbar })}
    </section>
    ${renderQuality(meta)}
  `;

  bindInteractions(host, cycleCode, entries, filters, signal);
}
